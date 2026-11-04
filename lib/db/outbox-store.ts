import type { IDatabase } from "./database-types";

export type OutboxPayloadKind = "text" | "media";

export type OutboxEntry = {
  clientMessageId: string;
  localMessageId: string;
  conversationId: string;
  peerUserId: string;
  peerDeviceId: string;
  /** Text body, or serialized MediaPayload JSON for media. */
  plaintext: string;
  payloadKind: OutboxPayloadKind;
  mediaAttachmentId?: string;
  mediaBlobCached: boolean;
  /** When set, this outbox row is a group (Sender Keys) send. */
  groupId?: string;
  createdAt: number;
  expiresAt: number;
  resendCount: number;
  lastResentAt?: number;
  receiptedAt?: number;
};

export type OutboxUpsertInput = Omit<
  OutboxEntry,
  "resendCount" | "receiptedAt" | "lastResentAt" | "payloadKind" | "mediaBlobCached"
> & {
  resendCount?: number;
  payloadKind?: OutboxPayloadKind;
  mediaBlobCached?: boolean;
  mediaAttachmentId?: string;
  groupId?: string;
};

export interface IOutboxStore {
  upsertPending(entry: OutboxUpsertInput): Promise<void>;
  markReceipted(clientMessageId: string, at: number): Promise<boolean>;
  listPendingForPeerDevice(peerDeviceId: string, now: number): Promise<OutboxEntry[]>;
  listPendingForConversation(conversationId: string, now: number): Promise<OutboxEntry[]>;
  listPendingGroups(now: number): Promise<OutboxEntry[]>;
  incrementResend(clientMessageId: string, at: number): Promise<number>;
  updateMediaAttachment(
    clientMessageId: string,
    attachmentId: string,
    blobCached: boolean,
  ): Promise<void>;
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
  payload_kind?: string | null;
  media_attachment_id?: string | null;
  media_blob_cached?: number | null;
  group_id?: string | null;
};

function mapRow(row: OutboxRow): OutboxEntry {
  const kind = row.payload_kind === "media" ? "media" : "text";
  return {
    clientMessageId: row.client_message_id,
    localMessageId: row.local_message_id,
    conversationId: row.conversation_id,
    peerUserId: row.peer_user_id,
    peerDeviceId: row.peer_device_id,
    plaintext: row.plaintext,
    payloadKind: kind,
    mediaAttachmentId: row.media_attachment_id ?? undefined,
    mediaBlobCached: (row.media_blob_cached ?? 0) === 1,
    groupId: row.group_id ?? undefined,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    resendCount: row.resend_count,
    lastResentAt: row.last_resent_at ?? undefined,
    receiptedAt: row.receipted_at ?? undefined,
  };
}

export class OutboxStore implements IOutboxStore {
  constructor(private readonly db: IDatabase) {}

  async upsertPending(entry: OutboxUpsertInput): Promise<void> {
    const kind = entry.payloadKind ?? "text";
    const blobCached = entry.mediaBlobCached ? 1 : 0;
    await this.db.run(
      `INSERT INTO message_outbox (
         client_message_id, local_message_id, conversation_id, peer_user_id, peer_device_id,
         plaintext, created_at, expires_at, resend_count, last_resent_at, receipted_at,
         payload_kind, media_attachment_id, media_blob_cached, group_id
       ) VALUES (?,?,?,?,?,?,?,?,?,?,NULL,?,?,?,?)
       ON CONFLICT(client_message_id) DO UPDATE SET
         plaintext = excluded.plaintext,
         expires_at = excluded.expires_at,
         local_message_id = excluded.local_message_id,
         payload_kind = excluded.payload_kind,
         media_attachment_id = excluded.media_attachment_id,
         media_blob_cached = excluded.media_blob_cached,
         group_id = excluded.group_id
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
        kind,
        entry.mediaAttachmentId ?? null,
        blobCached,
        entry.groupId ?? null,
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

  async listPendingGroups(now: number): Promise<OutboxEntry[]> {
    const rows = await this.db.getAll<OutboxRow>(
      `SELECT * FROM message_outbox
       WHERE group_id IS NOT NULL AND receipted_at IS NULL AND expires_at > ?
       ORDER BY created_at ASC`,
      [now],
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

  async updateMediaAttachment(
    clientMessageId: string,
    attachmentId: string,
    blobCached: boolean,
  ): Promise<void> {
    await this.db.run(
      `UPDATE message_outbox
       SET media_attachment_id = ?, media_blob_cached = ?
       WHERE client_message_id = ? AND receipted_at IS NULL`,
      [attachmentId, blobCached ? 1 : 0, clientMessageId],
    );
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

  async upsertPending(entry: OutboxUpsertInput): Promise<void> {
    const existing = this.rows.get(entry.clientMessageId);
    if (existing?.receiptedAt != null) return;
    this.rows.set(entry.clientMessageId, {
      ...entry,
      payloadKind: entry.payloadKind ?? "text",
      mediaBlobCached: entry.mediaBlobCached ?? false,
      mediaAttachmentId: entry.mediaAttachmentId,
      groupId: entry.groupId ?? existing?.groupId,
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

  async listPendingGroups(now: number): Promise<OutboxEntry[]> {
    return [...this.rows.values()]
      .filter(
        (r) =>
          r.groupId != null &&
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

  async updateMediaAttachment(
    clientMessageId: string,
    attachmentId: string,
    blobCached: boolean,
  ): Promise<void> {
    const row = this.rows.get(clientMessageId);
    if (!row || row.receiptedAt != null) return;
    this.rows.set(clientMessageId, {
      ...row,
      mediaAttachmentId: attachmentId,
      mediaBlobCached: blobCached,
    });
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
