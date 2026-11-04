import { MESSAGE_FULL_SELECT, MESSAGE_LIST_SELECT } from "./message-list-columns";
import type { IDatabase } from "./database-types";
import type { LocalMessage, MessageStatus } from "./types";

export interface IMessageStore {
  insert(message: LocalMessage): Promise<void>;
  /**
   * Oldest-first page for a conversation (newest at the end).
   * `before` is an exclusive createdAt cursor (load older than this).
   */
  listByConversation(
    conversationId: string,
    limit: number,
    before?: number,
  ): Promise<LocalMessage[]>;
  updateStatus(id: string, status: MessageStatus): Promise<void>;
  updateServerEnvelopeId(id: string, serverEnvelopeId: string): Promise<void>;
  updateAttachmentId(id: string, attachmentId: string): Promise<void>;
  getById(id: string): Promise<LocalMessage | null>;
  getByClientId(clientId: string): Promise<LocalMessage | null>;
  getByServerEnvelopeId(serverEnvelopeId: string): Promise<LocalMessage | null>;
}

type MessageRow = {
  id: string;
  client_id: string;
  conversation_id: string;
  direction: string;
  kind: string | null;
  plaintext: string;
  ciphertext?: Uint8Array | null;
  message_type?: number | null;
  status: string;
  sender_device_id: string;
  sender_user_id: string | null;
  server_envelope_id: string | null;
  created_at: number;
  attachment_id: string | null;
};

function mapRow(row: MessageRow): LocalMessage {
  const kind =
    row.kind === "voice" || row.kind === "video" ? row.kind : "text";
  return {
    id: row.id,
    clientId: row.client_id,
    conversationId: row.conversation_id,
    direction: row.direction as LocalMessage["direction"],
    kind,
    plaintext: row.plaintext,
    ciphertext: row.ciphertext ?? undefined,
    messageType:
      row.message_type === 2 || row.message_type === 3 || row.message_type === 4
        ? (row.message_type as 2 | 3 | 4)
        : undefined,
    status: row.status as LocalMessage["status"],
    senderDeviceId: row.sender_device_id,
    senderUserId: row.sender_user_id ?? undefined,
    serverEnvelopeId: row.server_envelope_id ?? undefined,
    createdAt: row.created_at,
    attachmentId: row.attachment_id ?? undefined,
  };
}

export class MessageStore implements IMessageStore {
  constructor(private readonly db: IDatabase) {}

  async insert(m: LocalMessage): Promise<void> {
    await this.db.run(
      `INSERT INTO messages (id, client_id, conversation_id, direction, kind, plaintext,
        ciphertext, message_type, status, sender_device_id, sender_user_id, server_envelope_id, created_at, attachment_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        m.id,
        m.clientId,
        m.conversationId,
        m.direction,
        m.kind ?? "text",
        m.plaintext,
        m.ciphertext ?? null,
        m.messageType ?? null,
        m.status,
        m.senderDeviceId,
        m.senderUserId ?? null,
        m.serverEnvelopeId ?? null,
        m.createdAt,
        m.attachmentId ?? null,
      ],
    );
  }

  async listByConversation(
    conversationId: string,
    limit: number,
    before?: number,
  ): Promise<LocalMessage[]> {
    const rows = before
      ? await this.db.getAll<MessageRow>(
          `SELECT ${MESSAGE_LIST_SELECT} FROM messages
           WHERE conversation_id = ? AND created_at < ?
           ORDER BY created_at DESC LIMIT ?`,
          [conversationId, before, limit],
        )
      : await this.db.getAll<MessageRow>(
          `SELECT ${MESSAGE_LIST_SELECT} FROM messages
           WHERE conversation_id = ?
           ORDER BY created_at DESC LIMIT ?`,
          [conversationId, limit],
        );
    // SQL is DESC (newest first); reverse to oldest-first for bottom-anchored FlashList.
    return rows.map(mapRow).reverse();
  }

  async updateStatus(id: string, status: MessageStatus): Promise<void> {
    await this.db.run(`UPDATE messages SET status = ? WHERE id = ?`, [
      status,
      id,
    ]);
  }

  async updateServerEnvelopeId(
    id: string,
    serverEnvelopeId: string,
  ): Promise<void> {
    await this.db.run(
      `UPDATE messages SET server_envelope_id = ? WHERE id = ?`,
      [serverEnvelopeId, id],
    );
  }

  async updateAttachmentId(id: string, attachmentId: string): Promise<void> {
    await this.db.run(`UPDATE messages SET attachment_id = ? WHERE id = ?`, [
      attachmentId,
      id,
    ]);
  }

  async getById(id: string): Promise<LocalMessage | null> {
    const row = await this.db.getFirst<MessageRow>(
      `SELECT ${MESSAGE_FULL_SELECT} FROM messages WHERE id = ?`,
      [id],
    );
    return row ? mapRow(row) : null;
  }

  async getByClientId(clientId: string): Promise<LocalMessage | null> {
    const row = await this.db.getFirst<MessageRow>(
      `SELECT ${MESSAGE_FULL_SELECT} FROM messages WHERE client_id = ?`,
      [clientId],
    );
    return row ? mapRow(row) : null;
  }

  async getByServerEnvelopeId(
    serverEnvelopeId: string,
  ): Promise<LocalMessage | null> {
    const row = await this.db.getFirst<MessageRow>(
      `SELECT ${MESSAGE_FULL_SELECT} FROM messages WHERE server_envelope_id = ?`,
      [serverEnvelopeId],
    );
    return row ? mapRow(row) : null;
  }
}
