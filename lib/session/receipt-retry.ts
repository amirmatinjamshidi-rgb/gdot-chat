import type { Conversation } from "@/lib/db/types";
import { isQuietDbCancel } from "@/lib/db/db-errors";
import type { IPendingReceiptStore } from "@/lib/db/pending-receipt-store";
import { serializeReceiptPayload } from "@/lib/protocol/payload";
import type { Clock } from "@/lib/session/inbound/constants";
import { systemClock } from "@/lib/session/inbound/constants";
import { exponentialBackoffMs } from "@/lib/session/backoff";
import {
  RECEIPT_BACKOFF_BASE_MS,
  RECEIPT_BACKOFF_MAX_MS,
  RECEIPT_MAX_ATTEMPTS,
  RECEIPT_QUEUE_MAX,
} from "@/lib/session/receipt-retry-constants";

export type ReceiptSendFn = (
  conversation: Conversation,
  plaintext: string,
) => Promise<void>;

export type ReceiptRandom = () => number;

/** @deprecated Prefer {@link exponentialBackoffMs}; kept for existing imports. */
export function receiptBackoffMs(
  attemptCount: number,
  random: ReceiptRandom = Math.random,
): number {
  return exponentialBackoffMs(attemptCount, {
    baseMs: RECEIPT_BACKOFF_BASE_MS,
    maxMs: RECEIPT_BACKOFF_MAX_MS,
    random,
  });
}

export type ReceiptRetryDeps = {
  store: IPendingReceiptStore;
  sendEncrypted: ReceiptSendFn;
  /** Resolve a conversation by id for flush (must include peer device fields). */
  getConversation: (conversationId: string) => Promise<Conversation | null>;
  clock?: Clock;
  random?: ReceiptRandom;
  maxAttempts?: number;
  queueMax?: number;
};

/**
 * Persists failed E2EE delivery receipts and retries with backoff + jitter.
 * Call {@link ReceiptRetryService.flushDue} on reconnect / after enqueue.
 */
export class ReceiptRetryService {
  private readonly clock: Clock;
  private readonly random: ReceiptRandom;
  private readonly maxAttempts: number;
  private readonly queueMax: number;
  private flushInFlight: Promise<number> | null = null;

  constructor(private readonly deps: ReceiptRetryDeps) {
    this.clock = deps.clock ?? systemClock;
    this.random = deps.random ?? Math.random;
    this.maxAttempts = deps.maxAttempts ?? RECEIPT_MAX_ATTEMPTS;
    this.queueMax = deps.queueMax ?? RECEIPT_QUEUE_MAX;
  }

  /**
   * Enqueue message ids (deduped by clientMessageId) and try an immediate flush
   * for that conversation. Never throws.
   */
  async enqueueAndFlush(
    conversation: Conversation,
    messageIds: string[],
  ): Promise<void> {
    if (messageIds.length === 0) return;
    const now = this.clock();
    const unique = [...new Set(messageIds.filter(Boolean))];
    await this.deps.store.enqueue(
      unique.map((clientMessageId) => ({
        clientMessageId,
        conversationId: conversation.id,
        peerUserId: conversation.peerUserId,
        peerDeviceId: conversation.peerDeviceId,
        createdAt: now,
        nextAttemptAt: now,
      })),
    );
    await this.deps.store.trimOldest(this.queueMax);
    try {
      await this.flushConversation(conversation, now);
    } catch {
      /* next flushDue / reconnect */
    }
  }

  /** Flush all due receipts (reconnect / timer). Serialized. */
  async flushDue(): Promise<number> {
    if (this.flushInFlight) return this.flushInFlight;
    this.flushInFlight = this.flushDueInner().finally(() => {
      this.flushInFlight = null;
    });
    return this.flushInFlight;
  }

  private async flushDueInner(): Promise<number> {
    const now = this.clock();
    const due = await this.deps.store.listDue(now, 100);
    if (due.length === 0) return 0;

    const byConversation = new Map<string, typeof due>();
    for (const row of due) {
      const list = byConversation.get(row.conversationId) ?? [];
      list.push(row);
      byConversation.set(row.conversationId, list);
    }

    let sent = 0;
    for (const [conversationId, rows] of byConversation) {
      const conversation = await this.deps.getConversation(conversationId);
      if (!conversation) {
        await this.deps.store.remove(rows.map((r) => r.clientMessageId));
        continue;
      }
      sent += await this.sendBatch(conversation, rows, now);
    }
    return sent;
  }

  private async flushConversation(
    conversation: Conversation,
    now: number,
  ): Promise<number> {
    const due = await this.deps.store.listDueForConversation(
      conversation.id,
      now,
      100,
    );
    if (due.length === 0) return 0;
    return this.sendBatch(conversation, due, now);
  }

  private async sendBatch(
    conversation: Conversation,
    rows: { clientMessageId: string; attemptCount: number }[],
    now: number,
  ): Promise<number> {
    const eligible = rows.filter((r) => r.attemptCount < this.maxAttempts);
    const exhausted = rows.filter((r) => r.attemptCount >= this.maxAttempts);
    if (exhausted.length > 0) {
      await this.deps.store.remove(exhausted.map((r) => r.clientMessageId));
    }
    if (eligible.length === 0) return 0;

    const ids = eligible.map((r) => r.clientMessageId);
    try {
      await this.deps.sendEncrypted(
        conversation,
        serializeReceiptPayload(ids),
      );
      await this.deps.store.remove(ids);
      return ids.length;
    } catch (e) {
      if (isQuietDbCancel(e)) {
        return 0;
      }
      const msg = e instanceof Error ? e.message : String(e);
      for (const row of eligible) {
        const nextAttempt = row.attemptCount + 1;
        if (nextAttempt >= this.maxAttempts) {
          await this.deps.store.remove([row.clientMessageId]);
          continue;
        }
        const delay = receiptBackoffMs(nextAttempt, this.random);
        await this.deps.store.markAttempt(
          row.clientMessageId,
          now + delay,
          msg,
        );
      }
      return 0;
    }
  }
}
