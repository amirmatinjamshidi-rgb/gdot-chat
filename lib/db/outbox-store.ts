import type { IDatabase } from "./database-types";

export type OutboxEntry = {
  clientMessageId: string;
  localMessageId: string;
  conversationId: string;
  peerUserId: string;
  peerDeviceId: string;
  plaintext: string;
  createdAt: number;
  expiresAt: number;
  resendCount: number;
  lastResentAt?: number;
  receiptedAt?: number;
};

export interface IOutboxStore {
  upsertPending(entry: Omit<OutboxEntry, "resendCount" | "receiptedAt" | "lastResentAt"> & { resendCount?: number }): Promise<void>;
  markReceipted(clientMessageId: string, at: number): Promise<boolean>;
  listPendingForPeerDevice(peerDeviceId: string, now: number): Promise<OutboxEntry[]>;
  listPendingForConversation(conversationId: string, now: number): Promise<OutboxEntry[]>;
  incrementResend(clientMessageId: string, at: number): Promise<number>;
  purgeExpired(now: number): Promise<number>;
  purgeReceipted(): Promise<number>;
  trimConversation(conversationId: string, maxPending: number): Promise<number>;
  get(clientMessageId: string): Promise<OutboxEntry | null>;
}

type OutboxRow = {
  client_message_id: string;
  local_message_id: string;
  conversation_id: string;
  peer_user_id: string;
  peer_device_id: string;
  plaintext: string;
  created_at: number;
  expires_at: number;
  resend_count: number;
  last_resent_at: number | null;
  receipted_at: number | null;
};

function mapRow(row: OutboxRow): OutboxEntry {
  return {
    clientMessageId: row.client_message_id,
    localMessageId: row.local_message_id,
    conversationId: row.conversation_id,
    peerUserId: row.peer_user_id,
    peerDeviceId: row.peer_device_id,
    plaintext: row.plaintext,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    resendCount: row.resend_count,
    lastResentAt: row.last_resent_at ?? undefined,
    receiptedAt: row.receipted_at ?? undefined,
  };
}

export class OutboxStore implements IOutboxStore {
  constructor(private readonly db: IDatabase) {}

  async upsertPending(
    entry: Omit<OutboxEntry, "resendCount" | "receiptedAt" | "lastResentAt"> & {
      resendCount?: number;
    },
  ): Promise<void> {
    await this.db.run(
      `INSERT INTO message_outbox (
         client_message_id, local_message_id, conversation_id, peer_user_id, peer_device_id,
         plaintext, created_at, expires_at, resend_count, last_resent_at, receipted_at
       ) VALUES (?,?,?,?,?,?,?,?,?,?,NULL)
       ON CONFLICT(client_message_id) DO UPDATE SET
         plaintext = excluded.plaintext,
         expires_at = excluded.expires_at,
         local_message_id = excluded.local_message_id
       WHERE message_outbox.receipted_at IS NULL`,
      [
        entry.clientMessageId,
        entry.localMessageId,
        entry.conversationId,
        entry.peerUserId,
        entry.peerDeviceId,
        entry.plaintext,
        entry.createdAt,
        entry.expiresAt,
        entry.resendCount ?? 0,
        null,
      ],
    );
  }

  async markReceipted(clientMessageId: string, at: number): Promise<boolean> {
    const result = await this.db.run(
      `UPDATE message_outbox SET receipted_at = ?
       WHERE client_message_id = ? AND receipted_at IS NULL`,
      [at, clientMessageId],
    );
    return result.changes > 0;
  }

  async listPendingForPeerDevice(
    peerDeviceId: string,
    now: number,
  ): Promise<OutboxEntry[]> {
    const rows = await this.db.getAll<OutboxRow>(
      `SELECT * FROM message_outbox
       WHERE peer_device_id = ? AND receipted_at IS NULL AND expires_at > ?
       ORDER BY created_at ASC`,
      [peerDeviceId, now],
    );
    return rows.map(mapRow);
  }

  async listPendingForConversation(
    conversationId: string,
    now: number,
  ): Promise<OutboxEntry[]> {
    const rows = await this.db.getAll<OutboxRow>(
      `SELECT * FROM message_outbox
       WHERE conversation_id = ? AND receipted_at IS NULL AND expires_at > ?
       ORDER BY created_at ASC`,
      [conversationId, now],
    );
    return rows.map(mapRow);
  }

  async incrementResend(clientMessageId: string, at: number): Promise<number> {
    await this.db.run(
      `UPDATE message_outbox
       SET resend_count = resend_count + 1, last_resent_at = ?
       WHERE client_message_id = ? AND receipted_at IS NULL`,
      [at, clientMessageId],
    );
    const row = await this.get(clientMessageId);
    return row?.resendCount ?? 0;
  }

  async purgeExpired(now: number): Promise<number> {
    const result = await this.db.run(
      `DELETE FROM message_outbox WHERE expires_at <= ? AND receipted_at IS NULL`,
      [now],
    );
    return result.changes;
  }

  async purgeReceipted(): Promise<number> {
    const result = await this.db.run(
      `DELETE FROM message_outbox WHERE receipted_at IS NOT NULL`,
    );
    return result.changes;
  }

  async trimConversation(
    conversationId: string,
    maxPending: number,
  ): Promise<number> {
    const rows = await this.db.getAll<OutboxRow>(
      `SELECT * FROM message_outbox
       WHERE conversation_id = ? AND receipted_at IS NULL
       ORDER BY created_at ASC`,
      [conversationId],
    );
    const pending = rows.map(mapRow);
    if (pending.length <= maxPending) return 0;
    const drop = pending.slice(0, pending.length - maxPending);
    for (const e of drop) {
      await this.db.run(
        `DELETE FROM message_outbox WHERE client_message_id = ?`,
        [e.clientMessageId],
      );
    }
    return drop.length;
  }

  async get(clientMessageId: string): Promise<OutboxEntry | null> {
    const row = await this.db.getFirst<OutboxRow>(
      `SELECT * FROM message_outbox WHERE client_message_id = ?`,
      [clientMessageId],
    );
    return row ? mapRow(row) : null;
  }
}

/** In-memory outbox for unit/E2E tests (injected clock via caller). */
export class MemoryOutboxStore implements IOutboxStore {
  private readonly rows = new Map<string, OutboxEntry>();

  async upsertPending(
    entry: Omit<OutboxEntry, "resendCount" | "receiptedAt" | "lastResentAt"> & {
      resendCount?: number;
    },
  ): Promise<void> {
    const existing = this.rows.get(entry.clientMessageId);
    if (existing?.receiptedAt != null) return;
    this.rows.set(entry.clientMessageId, {
      ...entry,
      resendCount: entry.resendCount ?? existing?.resendCount ?? 0,
      lastResentAt: existing?.lastResentAt,
      receiptedAt: undefined,
    });
  }

  async markReceipted(clientMessageId: string, at: number): Promise<boolean> {
    const row = this.rows.get(clientMessageId);
    if (!row || row.receiptedAt != null) return false;
    this.rows.set(clientMessageId, { ...row, receiptedAt: at });
    return true;
  }

  async listPendingForPeerDevice(
    peerDeviceId: string,
    now: number,
  ): Promise<OutboxEntry[]> {
    return [...this.rows.values()]
      .filter(
        (r) =>
          r.peerDeviceId === peerDeviceId &&
          r.receiptedAt == null &&
          r.expiresAt > now,
      )
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  async listPendingForConversation(
    conversationId: string,
    now: number,
  ): Promise<OutboxEntry[]> {
    return [...this.rows.values()]
      .filter(
        (r) =>
          r.conversationId === conversationId &&
          r.receiptedAt == null &&
          r.expiresAt > now,
      )
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  async incrementResend(clientMessageId: string, at: number): Promise<number> {
    const row = this.rows.get(clientMessageId);
    if (!row || row.receiptedAt != null) return 0;
    const next = { ...row, resendCount: row.resendCount + 1, lastResentAt: at };
    this.rows.set(clientMessageId, next);
    return next.resendCount;
  }

  async purgeExpired(now: number): Promise<number> {
    let n = 0;
    for (const [id, row] of this.rows) {
      if (row.receiptedAt == null && row.expiresAt <= now) {
        this.rows.delete(id);
        n++;
      }
    }
    return n;
  }

  async purgeReceipted(): Promise<number> {
    let n = 0;
    for (const [id, row] of this.rows) {
      if (row.receiptedAt != null) {
        this.rows.delete(id);
        n++;
      }
    }
    return n;
  }

  async trimConversation(
    conversationId: string,
    maxPending: number,
  ): Promise<number> {
    const pending = [...this.rows.values()]
      .filter(
        (r) => r.conversationId === conversationId && r.receiptedAt == null,
      )
      .sort((a, b) => a.createdAt - b.createdAt);
    if (pending.length <= maxPending) return 0;
    const drop = pending.slice(0, pending.length - maxPending);
    for (const e of drop) this.rows.delete(e.clientMessageId);
    return drop.length;
  }

  async get(clientMessageId: string): Promise<OutboxEntry | null> {
    return this.rows.get(clientMessageId) ?? null;
  }
}
