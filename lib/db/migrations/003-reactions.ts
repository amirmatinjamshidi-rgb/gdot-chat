/** SQLCipher schema migration 003 — message reactions */
export const MIGRATION_003_SQL = `
CREATE TABLE IF NOT EXISTS message_reactions (
    message_id      TEXT NOT NULL,
    emoji           TEXT NOT NULL,
    user_id         TEXT NOT NULL,
    created_at      INTEGER NOT NULL,
    PRIMARY KEY (message_id, emoji, user_id),
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_message_reactions_message
    ON message_reactions (message_id);
`;
