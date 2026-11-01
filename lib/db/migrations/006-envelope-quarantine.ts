/** SQLCipher schema migration 006 — envelope quarantine + attempt tracking */
export const MIGRATION_006_SQL = `
CREATE TABLE IF NOT EXISTS envelope_quarantine (
    id                   TEXT PRIMARY KEY,
    server_envelope_id   TEXT NOT NULL UNIQUE,
    sender_device_id     TEXT NOT NULL,
    sender_user_id       TEXT,
    sender_username      TEXT,
    conversation_id      TEXT,
    kind                 TEXT NOT NULL CHECK (kind IN ('identity_key','message_request')),
    message_type         INTEGER NOT NULL,
    ciphertext           BLOB NOT NULL,
    error_class          TEXT NOT NULL,
    error_name           TEXT NOT NULL DEFAULT '',
    created_at           INTEGER NOT NULL,
    expires_at           INTEGER,
    status               TEXT NOT NULL CHECK (status IN ('pending','accepted','rejected','expired','processed')),
    updated_at           INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_envelope_quarantine_status
  ON envelope_quarantine (status, kind);

CREATE INDEX IF NOT EXISTS idx_envelope_quarantine_peer
  ON envelope_quarantine (sender_user_id, status);

CREATE TABLE IF NOT EXISTS envelope_attempts (
    server_envelope_id   TEXT PRIMARY KEY,
    attempt_count        INTEGER NOT NULL,
    first_attempt_at     INTEGER NOT NULL,
    last_attempt_at      INTEGER NOT NULL,
    last_error_class     TEXT NOT NULL DEFAULT '',
    last_error_name      TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS session_reset_sent (
    peer_device_id        TEXT PRIMARY KEY,
    last_sent_at         INTEGER NOT NULL
);
`;
