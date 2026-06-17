import type { Reaction } from "@/components/reactions/types";
import type { IDatabase } from "./database-types";

export interface IReactionStore {
  toggle(
    messageId: string,
    emoji: string,
    userId: string,
  ): Promise<Reaction[]>;
  listForMessage(messageId: string): Promise<Reaction[]>;
  listForConversation(conversationId: string): Promise<Map<string, Reaction[]>>;
}

type ReactionRow = {
  message_id: string;
  emoji: string;
  user_id: string;
};

function aggregateRows(rows: ReactionRow[]): Reaction[] {
  const byEmoji = new Map<string, string[]>();
  for (const row of rows) {
    const users = byEmoji.get(row.emoji) ?? [];
    users.push(row.user_id);
    byEmoji.set(row.emoji, users);
  }
  return [...byEmoji.entries()]
    .map(([emoji, users]) => ({
      emoji,
      users,
      count: users.length,
    }))
    .filter((r) => r.count > 0);
}

export class ReactionStore implements IReactionStore {
  constructor(private readonly db: IDatabase) {}

  async toggle(
    messageId: string,
    emoji: string,
    userId: string,
  ): Promise<Reaction[]> {
    const existing = await this.db.getFirst<{ user_id: string }>(
      `SELECT user_id FROM message_reactions
       WHERE message_id = ? AND emoji = ? AND user_id = ?`,
      [messageId, emoji, userId],
    );

    if (existing) {
      await this.db.run(
        `DELETE FROM message_reactions
         WHERE message_id = ? AND emoji = ? AND user_id = ?`,
        [messageId, emoji, userId],
      );
    } else {
      await this.db.run(
        `INSERT INTO message_reactions (message_id, emoji, user_id, created_at)
         VALUES (?, ?, ?, ?)`,
        [messageId, emoji, userId, Date.now()],
      );
    }

    return this.listForMessage(messageId);
  }

  async listForMessage(messageId: string): Promise<Reaction[]> {
    const rows = await this.db.getAll<ReactionRow>(
      `SELECT message_id, emoji, user_id FROM message_reactions
       WHERE message_id = ?`,
      [messageId],
    );
    return aggregateRows(rows);
  }

  async listForConversation(conversationId: string): Promise<Map<string, Reaction[]>> {
    const rows = await this.db.getAll<ReactionRow>(
      `SELECT r.message_id, r.emoji, r.user_id
       FROM message_reactions r
       INNER JOIN messages m ON m.id = r.message_id
       WHERE m.conversation_id = ?`,
      [conversationId],
    );
    const map = new Map<string, Reaction[]>();
    const byMessage = new Map<string, ReactionRow[]>();
    for (const row of rows) {
      const list = byMessage.get(row.message_id) ?? [];
      list.push(row);
      byMessage.set(row.message_id, list);
    }
    for (const [messageId, messageRows] of byMessage) {
      map.set(messageId, aggregateRows(messageRows));
    }
    return map;
  }
}
