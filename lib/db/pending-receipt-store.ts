import type { IDatabase } from "./database-types";

export type PendingReceipt = {
  clientMessageId: string;
  conversationId: string;
  peerUserId: string;
  peerDeviceId: string;
  createdAt: number;
  nextAttemptAt: number;
  attemptCount: number;
  lastError?: string;
};

export type PendingReceiptEnqueue = {
  clientMessageId: string;
  conversationId: string;
  peerUserId: string;
  peerDeviceId: string;
  createdAt: number;
  nextAttemptAt: number;
};

export interface IPendingReceiptStore {
  /** Insert if absent; existing rows keep attempt state (dedupe). */
  enqueue(entries: PendingReceiptEnqueue[]): Promise<number>;
  listDue(now: number, limit: number): Promise<PendingReceipt[]>;
  listDueForConversation(
    conversationId: string,
    now: number,
    limit: number,
  ): Promise<PendingReceipt[]>;
  markAttempt(
    clientMessageId: string,
    nextAttemptAt: number,
    error: string | undefined,
  ): Promise<void>;
  remove(clientMessageIds: string[]): Promise<number>;
  count(): Promise<number>;
  trimOldest(maxKeep: number): Promise<number>;
  get(clientMessageId: string): Promise<PendingReceipt | null>;
}

type Row = {
  client_message_id: string;
  conversation_id: string;
  peer_user_id: string;
  peer_device_id: string;
  created_at: number;
  next_attempt_at: number;
  attempt_count: number;
  last_error: string | null;
};

function mapRow(row: Row): PendingReceipt {
  return {
    clientMessageId: row.client_message_id,
    conversationId: row.conversation_id,
    peerUserId: row.peer_user_id,
    peerDeviceId: row.peer_device_id,
    createdAt: row.created_at,
    nextAttemptAt: row.next_attempt_at,
    attemptCount: row.attempt_count,
    lastError: row.last_error ?? undefined,
  };
}

export class PendingReceiptStore implements IPendingReceiptStore {
  constructor(private readonly db: IDatabase) {}

  async enqueue(entries: PendingReceiptEnqueue[]): Promise<number> {
    let inserted = 0;
    for (const e of entries) {
      const result = await this.db.run(
        `INSERT INTO pending_delivery_receipts (
           client_message_id, conversation_id, peer_user_id, peer_device_id,
           created_at, next_attempt_at, attempt_count, last_error
         ) VALUES (?,?,?,?,?,?,0,NULL)
         ON CONFLICT(client_message_id) DO NOTHING`,
        [
          e.clientMessageId,
          e.conversationId,
          e.peerUserId,
          e.peerDeviceId,
          e.createdAt,
          e.nextAttemptAt,
        ],
      );
      if ((result?.changes ?? 0) > 0) inserted += 1;
    }
    return inserted;
  }

  async listDue(now: number, limit: number): Promise<PendingReceipt[]> {
    const rows = await this.db.getAll<Row>(
      `SELECT * FROM pending_delivery_receipts
       WHERE next_attempt_at <= ?
       ORDER BY next_attempt_at ASC, created_at ASC
       LIMIT ?`,
      [now, limit],
    );
    return rows.map(mapRow);
  }

  async listDueForConversation(
    conversationId: string,
    now: number,
    limit: number,
  ): Promise<PendingReceipt[]> {
    const rows = await this.db.getAll<Row>(
      `SELECT * FROM pending_delivery_receipts
       WHERE conversation_id = ? AND next_attempt_at <= ?
       ORDER BY next_attempt_at ASC, created_at ASC
       LIMIT ?`,
      [conversationId, now, limit],
    );
    return rows.map(mapRow);
  }

  async markAttempt(
    clientMessageId: string,
    nextAttemptAt: number,
    error: string | undefined,
  ): Promise<void> {
    await this.db.run(
      `UPDATE pending_delivery_receipts
       SET attempt_count = attempt_count + 1,
           next_attempt_at = ?,
           last_error = ?
       WHERE client_message_id = ?`,
      [nextAttemptAt, error ?? null, clientMessageId],
    );
  }

  async remove(clientMessageIds: string[]): Promise<number> {
    if (clientMessageIds.length === 0) return 0;
    let n = 0;
    for (const id of clientMessageIds) {
      const result = await this.db.run(
        `DELETE FROM pending_delivery_receipts WHERE client_message_id = ?`,
        [id],
      );
      n += result?.changes ?? 0;
    }
    return n;
  }

  async count(): Promise<number> {
    const row = await this.db.getFirst<{ c: number }>(
      `SELECT COUNT(*) as c FROM pending_delivery_receipts`,
    );
    return row?.c ?? 0;
  }

  async trimOldest(maxKeep: number): Promise<number> {
    const total = await this.count();
    if (total <= maxKeep) return 0;
    const drop = total - maxKeep;
    const rows = await this.db.getAll<{ client_message_id: string }>(
      `SELECT client_message_id FROM pending_delivery_receipts
       ORDER BY created_at ASC LIMIT ?`,
      [drop],
    );
    return this.remove(rows.map((r) => r.client_message_id));
  }

  async get(clientMessageId: string): Promise<PendingReceipt | null> {
    const row = await this.db.getFirst<Row>(
      `SELECT * FROM pending_delivery_receipts WHERE client_message_id = ?`,
      [clientMessageId],
    );
    return row ? mapRow(row) : null;
  }
}

/** In-memory pending receipt queue for unit/E2E tests. */
export class MemoryPendingReceiptStore implements IPendingReceiptStore {
  private readonly rows = new Map<string, PendingReceipt>();

  async enqueue(entries: PendingReceiptEnqueue[]): Promise<number> {
    let inserted = 0;
    for (const e of entries) {
      if (this.rows.has(e.clientMessageId)) continue;
      this.rows.set(e.clientMessageId, {
        ...e,
        attemptCount: 0,
      });
      inserted += 1;
    }
    return inserted;
  }

  async listDue(now: number, limit: number): Promise<PendingReceipt[]> {
    return [...this.rows.values()]
      .filter((r) => r.nextAttemptAt <= now)
      .sort(
        (a, b) =>
          a.nextAttemptAt - b.nextAttemptAt || a.createdAt - b.createdAt,
      )
      .slice(0, limit);
  }

  async listDueForConversation(
    conversationId: string,
    now: number,
    limit: number,
  ): Promise<PendingReceipt[]> {
    return [...this.rows.values()]
      .filter(
        (r) => r.conversationId === conversationId && r.nextAttemptAt <= now,
      )
      .sort(
        (a, b) =>
          a.nextAttemptAt - b.nextAttemptAt || a.createdAt - b.createdAt,
      )
      .slice(0, limit);
  }

  async markAttempt(
    clientMessageId: string,
    nextAttemptAt: number,
    error: string | undefined,
  ): Promise<void> {
    const row = this.rows.get(clientMessageId);
    if (!row) return;
    this.rows.set(clientMessageId, {
      ...row,
      attemptCount: row.attemptCount + 1,
      nextAttemptAt,
      lastError: error,
    });
  }

  async remove(clientMessageIds: string[]): Promise<number> {
    let n = 0;
    for (const id of clientMessageIds) {
      if (this.rows.delete(id)) n += 1;
    }
    return n;
  }

  async count(): Promise<number> {
    return this.rows.size;
  }

  async trimOldest(maxKeep: number): Promise<number> {
    if (this.rows.size <= maxKeep) return 0;
    const ordered = [...this.rows.values()].sort(
      (a, b) => a.createdAt - b.createdAt,
    );
    const drop = ordered.slice(0, this.rows.size - maxKeep);
    for (const e of drop) this.rows.delete(e.clientMessageId);
    return drop.length;
  }

  async get(clientMessageId: string): Promise<PendingReceipt | null> {
    return this.rows.get(clientMessageId) ?? null;
  }
}
