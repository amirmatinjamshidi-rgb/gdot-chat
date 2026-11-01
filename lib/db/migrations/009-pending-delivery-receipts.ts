/** SQLCipher schema migration 009 — durable E2EE delivery-receipt retry queue */
export const MIGRATION_009_SQL = `
CREATE TABLE IF NOT EXISTS pending_delivery_receipts (
    client_message_id   TEXT PRIMARY KEY,
    conversation_id     TEXT NOT NULL,
    peer_user_id        TEXT NOT NULL,
    peer_device_id      TEXT NOT NULL,
    created_at          INTEGER NOT NULL,
    next_attempt_at     INTEGER NOT NULL,
    attempt_count       INTEGER NOT NULL DEFAULT 0,
    last_error          TEXT
);

CREATE INDEX IF NOT EXISTS idx_pending_delivery_receipts_due
  ON pending_delivery_receipts (next_attempt_at, attempt_count);

CREATE INDEX IF NOT EXISTS idx_pending_delivery_receipts_conversation
  ON pending_delivery_receipts (conversation_id, next_attempt_at);
`;
