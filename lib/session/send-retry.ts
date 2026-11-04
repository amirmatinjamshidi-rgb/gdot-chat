import type { Conversation } from "@/lib/db/types";
import { isQuietDbCancel } from "@/lib/db/db-errors";
import { exponentialBackoffMs } from "@/lib/session/backoff";
import type { Clock } from "@/lib/session/inbound/constants";
import { systemClock } from "@/lib/session/inbound/constants";
import {
  SEND_BACKOFF_BASE_MS,
  SEND_BACKOFF_MAX_MS,
  SEND_MAX_ATTEMPTS,
  SEND_QUEUE_MAX,
} from "@/lib/session/send-retry-constants";

export type SendRetryRandom = () => number;

export type PendingOutgoingSend = {
  clientMessageId: string;
  localMessageId: string;
  conversationId: string;
  plaintext: string;
  createdAt: number;
  nextAttemptAt: number;
  attemptCount: number;
  lastError?: string;
};

export type PendingOutgoingEnqueue = {
  clientMessageId: string;
  localMessageId: string;
  conversationId: string;
  plaintext: string;
  createdAt: number;
  nextAttemptAt: number;
};

export interface IPendingOutgoingSendStore {
  enqueue(entry: PendingOutgoingEnqueue): Promise<void>;
  listDue(now: number, limit: number): Promise<PendingOutgoingSend[]>;
  markAttempt(
    clientMessageId: string,
    nextAttemptAt: number,
    attemptCount: number,
    error: string | undefined,
  ): Promise<void>;
  remove(clientMessageIds: string[]): Promise<void>;
  trimOldest(maxKeep: number): Promise<void>;
  get(clientMessageId: string): Promise<PendingOutgoingSend | null>;
}

export class MemoryPendingOutgoingSendStore implements IPendingOutgoingSendStore {
  private readonly rows = new Map<string, PendingOutgoingSend>();

  async enqueue(entry: PendingOutgoingEnqueue): Promise<void> {
    if (this.rows.has(entry.clientMessageId)) return;
    this.rows.set(entry.clientMessageId, {
      ...entry,
      attemptCount: 0,
    });
  }

  async listDue(now: number, limit: number): Promise<PendingOutgoingSend[]> {
    return [...this.rows.values()]
      .filter((r) => r.nextAttemptAt <= now)
      .sort((a, b) => a.nextAttemptAt - b.nextAttemptAt || a.createdAt - b.createdAt)
      .slice(0, limit);
  }

  async markAttempt(
    clientMessageId: string,
    nextAttemptAt: number,
    attemptCount: number,
    error: string | undefined,
  ): Promise<void> {
    const row = this.rows.get(clientMessageId);
    if (!row) return;
    this.rows.set(clientMessageId, {
      ...row,
      nextAttemptAt,
      attemptCount,
      lastError: error,
    });
  }

  async remove(clientMessageIds: string[]): Promise<void> {
    for (const id of clientMessageIds) this.rows.delete(id);
  }

  async trimOldest(maxKeep: number): Promise<void> {
    if (this.rows.size <= maxKeep) return;
    const ordered = [...this.rows.values()].sort((a, b) => a.createdAt - b.createdAt);
    for (const row of ordered.slice(0, ordered.length - maxKeep)) {
      this.rows.delete(row.clientMessageId);
    }
  }

  async get(clientMessageId: string): Promise<PendingOutgoingSend | null> {
    return this.rows.get(clientMessageId) ?? null;
  }
}

export type SendRetryDeliverFn = (args: {
  conversation: Conversation;
  localMessageId: string;
  clientMessageId: string;
  plaintext: string;
}) => Promise<void>;

export type SendRetryDeps = {
  store: IPendingOutgoingSendStore;
  getConversation: (conversationId: string) => Promise<Conversation | null>;
  deliver: SendRetryDeliverFn;
  onDelivered?: (localMessageId: string) => Promise<void>;
  onGiveUp?: (localMessageId: string) => Promise<void>;
  clock?: Clock;
  random?: SendRetryRandom;
  maxAttempts?: number;
  queueMax?: number;
};

/**
 * Retries failed outgoing text sends with exponential backoff + jitter.
 * Call {@link SendRetryService.flushDue} on reconnect / foreground.
 */
export class SendRetryService {
  private readonly clock: Clock;
  private readonly random: SendRetryRandom;
  private readonly maxAttempts: number;
  private readonly queueMax: number;
  private flushInFlight: Promise<number> | null = null;

  constructor(private readonly deps: SendRetryDeps) {
    this.clock = deps.clock ?? systemClock;
    this.random = deps.random ?? Math.random;
    this.maxAttempts = deps.maxAttempts ?? SEND_MAX_ATTEMPTS;
    this.queueMax = deps.queueMax ?? SEND_QUEUE_MAX;
  }

  async enqueueFailed(entry: PendingOutgoingEnqueue): Promise<void> {
    await this.deps.store.enqueue(entry);
    await this.deps.store.trimOldest(this.queueMax);
  }

  async flushDue(): Promise<number> {
    if (this.flushInFlight) return this.flushInFlight;
    this.flushInFlight = this.flushDueInner().finally(() => {
      this.flushInFlight = null;
    });
    return this.flushInFlight;
  }

  private async flushDueInner(): Promise<number> {
    const now = this.clock();
    const due = await this.deps.store.listDue(now, 50);
    let sent = 0;
    for (const row of due) {
      if (row.attemptCount >= this.maxAttempts) {
        await this.deps.store.remove([row.clientMessageId]);
        await this.deps.onGiveUp?.(row.localMessageId);
        continue;
      }
      const conversation = await this.deps.getConversation(row.conversationId);
      if (!conversation) {
        await this.deps.store.remove([row.clientMessageId]);
        await this.deps.onGiveUp?.(row.localMessageId);
        continue;
      }
      try {
        await this.deps.deliver({
          conversation,
          localMessageId: row.localMessageId,
          clientMessageId: row.clientMessageId,
          plaintext: row.plaintext,
        });
        await this.deps.store.remove([row.clientMessageId]);
        await this.deps.onDelivered?.(row.localMessageId);
        sent += 1;
      } catch (e) {
        if (isQuietDbCancel(e)) {
          // Lock race: keep queued item untouched for unlock flush.
          continue;
        }
        const nextAttempt = row.attemptCount + 1;
        if (nextAttempt >= this.maxAttempts) {
          await this.deps.store.remove([row.clientMessageId]);
          await this.deps.onGiveUp?.(row.localMessageId);
          continue;
        }
        const delay = exponentialBackoffMs(nextAttempt, {
          baseMs: SEND_BACKOFF_BASE_MS,
          maxMs: SEND_BACKOFF_MAX_MS,
          random: this.random,
        });
        await this.deps.store.markAttempt(
          row.clientMessageId,
          now + delay,
          nextAttempt,
          e instanceof Error ? e.message : String(e),
        );
      }
    }
    return sent;
  }
}
