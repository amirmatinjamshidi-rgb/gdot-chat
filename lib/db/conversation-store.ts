import type { IDatabase } from "./database-types";
import type { Conversation } from "./types";

export interface IConversationStore {
  upsert(conversation: Conversation): Promise<void>;
  listAll(): Promise<Conversation[]>;
  getByPeer(peerUserId: string): Promise<Conversation | null>;
  getById(id: string): Promise<Conversation | null>;
}

type ConversationRow = {
  id: string;
  peer_user_id: string;
  peer_username: string;
  peer_device_id: string;
  last_message_preview: string;
  last_message_at: number;
  unread_count: number;
};

function mapRow(row: ConversationRow): Conversation {
  return {
    id: row.id,
    peerUserId: row.peer_user_id,
    peerUsername: row.peer_username,
    peerDeviceId: row.peer_device_id,
    lastMessagePreview: row.last_message_preview,
    lastMessageAt: row.last_message_at,
    unreadCount: row.unread_count,
  };
}

export class ConversationStore implements IConversationStore {
  constructor(private readonly db: IDatabase) {}

  async upsert(c: Conversation): Promise<void> {
    await this.db.run(
      `INSERT INTO conversations (id, peer_user_id, peer_username, peer_device_id,
        last_message_preview, last_message_at, unread_count)
       VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         peer_username = excluded.peer_username,
         peer_device_id = excluded.peer_device_id,
         last_message_preview = excluded.last_message_preview,
         last_message_at = excluded.last_message_at,
         unread_count = excluded.unread_count`,
      [
        c.id,
        c.peerUserId,
        c.peerUsername,
        c.peerDeviceId,
        c.lastMessagePreview,
        c.lastMessageAt,
        c.unreadCount,
      ],
    );
  }

  async listAll(): Promise<Conversation[]> {
    const rows = await this.db.getAll<ConversationRow>(
      `SELECT * FROM conversations ORDER BY last_message_at DESC`,
    );
    return rows.map(mapRow);
  }

  async getByPeer(peerUserId: string): Promise<Conversation | null> {
    const row = await this.db.getFirst<ConversationRow>(
      `SELECT * FROM conversations WHERE peer_user_id = ?`,
      [peerUserId],
    );
    return row ? mapRow(row) : null;
  }

  async getById(id: string): Promise<Conversation | null> {
    const row = await this.db.getFirst<ConversationRow>(
      `SELECT * FROM conversations WHERE id = ?`,
      [id],
    );
    return row ? mapRow(row) : null;
  }
}
