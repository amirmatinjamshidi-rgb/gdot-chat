import type { IDatabase } from "./database-types";
import type { LocalMessage, MessageStatus } from "./types";

export interface IMessageStore {
  insert(message: LocalMessage): Promise<void>;
  listByConversation(
    conversationId: string,
    limit: number,
    before?: number,
  ): Promise<LocalMessage[]>;
  updateStatus(id: string, status: MessageStatus): Promise<void>;
  getByClientId(clientId: string): Promise<LocalMessage | null>;
}

type MessageRow = {
  id: string;
  client_id: string;
  conversation_id: string;
  direction: string;
  plaintext: string;
  ciphertext: Uint8Array | null;
  message_type: number | null;
  status: string;
  sender_device_id: string;
  server_envelope_id: string | null;
  created_at: number;
};

function mapRow(row: MessageRow): LocalMessage {
  return {
    id: row.id,
    clientId: row.client_id,
    conversationId: row.conversation_id,
    direction: row.direction as LocalMessage["direction"],
    plaintext: row.plaintext,
    ciphertext: row.ciphertext ?? undefined,
    messageType:
      row.message_type === 2 || row.message_type === 3
        ? row.message_type
        : undefined,
    status: row.status as LocalMessage["status"],
    senderDeviceId: row.sender_device_id,
    serverEnvelopeId: row.server_envelope_id ?? undefined,
    createdAt: row.created_at,
  };
}

export class MessageStore implements IMessageStore {
  constructor(private readonly db: IDatabase) {}

  async insert(m: LocalMessage): Promise<void> {
    await this.db.run(
      `INSERT INTO messages (id, client_id, conversation_id, direction, plaintext,
        ciphertext, message_type, status, sender_device_id, server_envelope_id, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [
        m.id,
        m.clientId,
        m.conversationId,
        m.direction,
        m.plaintext,
        m.ciphertext ?? null,
        m.messageType ?? null,
        m.status,
        m.senderDeviceId,
        m.serverEnvelopeId ?? null,
        m.createdAt,
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
          `SELECT * FROM messages WHERE conversation_id = ? AND created_at < ?
           ORDER BY created_at DESC LIMIT ?`,
          [conversationId, before, limit],
        )
      : await this.db.getAll<MessageRow>(
          `SELECT * FROM messages WHERE conversation_id = ?
           ORDER BY created_at DESC LIMIT ?`,
          [conversationId, limit],
        );
    return rows.map(mapRow).reverse();
  }

  async updateStatus(id: string, status: MessageStatus): Promise<void> {
    await this.db.run(`UPDATE messages SET status = ? WHERE id = ?`, [
      status,
      id,
    ]);
  }

  async getByClientId(clientId: string): Promise<LocalMessage | null> {
    const row = await this.db.getFirst<MessageRow>(
      `SELECT * FROM messages WHERE client_id = ?`,
      [clientId],
    );
    return row ? mapRow(row) : null;
  }
}
