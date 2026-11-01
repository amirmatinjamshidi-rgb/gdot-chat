/** SQLCipher schema migration 007 — E2EE delivery outbox for post-reset resend */
export const MIGRATION_007_SQL = `
CREATE TABLE IF NOT EXISTS message_outbox (
    client_message_id   TEXT PRIMARY KEY,
    local_message_id    TEXT NOT NULL,
    conversation_id     TEXT NOT NULL,
    peer_user_id        TEXT NOT NULL,
    peer_device_id      TEXT NOT NULL,
    plaintext           TEXT NOT NULL,
    created_at          INTEGER NOT NULL,
    expires_at          INTEGER NOT NULL,
    resend_count        INTEGER NOT NULL DEFAULT 0,
    last_resent_at      INTEGER,
    receipted_at        INTEGER
);

CREATE INDEX IF NOT EXISTS idx_message_outbox_conversation_pending
  ON message_outbox (conversation_id, receipted_at, created_at);

CREATE INDEX IF NOT EXISTS idx_message_outbox_peer_pending
  ON message_outbox (peer_device_id, receipted_at, created_at);

CREATE INDEX IF NOT EXISTS idx_message_outbox_expires
  ON message_outbox (expires_at) WHERE receipted_at IS NULL;
`;
