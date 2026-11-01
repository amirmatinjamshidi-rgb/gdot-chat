/** SQLCipher schema migration 012 — group receipts + message sender user id */
export const MIGRATION_012_SQL = `
CREATE TABLE IF NOT EXISTS group_receipts (
    group_id            TEXT NOT NULL,
    client_message_id   TEXT NOT NULL,
    from_user_id        TEXT NOT NULL,
    from_device_id      TEXT NOT NULL,
    kind                TEXT NOT NULL,
    at                  INTEGER NOT NULL,
    PRIMARY KEY (group_id, client_message_id, from_user_id, from_device_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_group_receipts_msg
  ON group_receipts (group_id, client_message_id, kind);

ALTER TABLE messages ADD COLUMN sender_user_id TEXT;
`;
