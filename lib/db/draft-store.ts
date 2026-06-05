import type { IDatabase } from "./database-types";

export interface IDraftStore {
  get(conversationId: string): Promise<string>;
  set(conversationId: string, text: string): Promise<void>;
  clear(conversationId: string): Promise<void>;
}

export class DraftStore implements IDraftStore {
  constructor(private readonly db: IDatabase) {}

  async get(conversationId: string): Promise<string> {
    const row = await this.db.getFirst<{ draft_text: string }>(
      `SELECT draft_text FROM composer_drafts WHERE conversation_id = ?`,
      [conversationId],
    );
    return row?.draft_text ?? "";
  }

  async set(conversationId: string, text: string): Promise<void> {
    if (!text) {
      await this.clear(conversationId);
      return;
    }
    await this.db.run(
      `INSERT OR REPLACE INTO composer_drafts (conversation_id, draft_text, updated_at)
       VALUES (?, ?, ?)`,
      [conversationId, text, Date.now()],
    );
  }

  async clear(conversationId: string): Promise<void> {
    await this.db.run(
      `DELETE FROM composer_drafts WHERE conversation_id = ?`,
      [conversationId],
    );
  }
}
