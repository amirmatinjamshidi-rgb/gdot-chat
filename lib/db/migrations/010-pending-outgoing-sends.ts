/** SQLCipher schema migration 010 — durable outgoing text send retry queue */
export const MIGRATION_010_SQL = `
CREATE TABLE IF NOT EXISTS pending_outgoing_sends (
    client_message_id   TEXT PRIMARY KEY,
    local_message_id    TEXT NOT NULL,
    conversation_id     TEXT NOT NULL,
    plaintext           TEXT NOT NULL,
    created_at          INTEGER NOT NULL,
    next_attempt_at     INTEGER NOT NULL,
    attempt_count       INTEGER NOT NULL DEFAULT 0,
    last_error          TEXT
);

CREATE INDEX IF NOT EXISTS idx_pending_outgoing_sends_due
  ON pending_outgoing_sends (next_attempt_at, attempt_count);
`;
