/** SQLCipher schema migration 004 — media messages and local attachments */
export const MIGRATION_004_SQL = `
ALTER TABLE messages ADD COLUMN kind TEXT NOT NULL DEFAULT 'text';
ALTER TABLE messages ADD COLUMN attachment_id TEXT;

CREATE TABLE IF NOT EXISTS local_attachments (
    attachment_id       TEXT PRIMARY KEY,
    message_id          TEXT NOT NULL,
    kind                TEXT NOT NULL CHECK (kind IN ('voice','video')),
    mime_type           TEXT NOT NULL,
    plain_size_bytes    INTEGER NOT NULL,
    duration_ms         INTEGER,
    width               INTEGER,
    height              INTEGER,
    chunk_size          INTEGER NOT NULL,
    chunk_count         INTEGER NOT NULL,
    media_key           BLOB NOT NULL,
    nonce_prefix        BLOB NOT NULL,
    local_uri           TEXT,
    source_uri          TEXT,
    transfer_state      TEXT NOT NULL,
    uploaded_chunks     TEXT NOT NULL DEFAULT '[]',
    downloaded_chunks   TEXT NOT NULL DEFAULT '[]',
    created_at          INTEGER NOT NULL,
    updated_at          INTEGER NOT NULL,
    FOREIGN KEY (message_id) REFERENCES messages(id)
);

CREATE INDEX IF NOT EXISTS idx_local_attachments_message ON local_attachments (message_id);
CREATE INDEX IF NOT EXISTS idx_local_attachments_state ON local_attachments (transfer_state);
`;