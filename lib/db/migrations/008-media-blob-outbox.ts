/** SQLCipher schema migration 008 — media blob cache + outbox media columns */
export const MIGRATION_008_SQL = `
CREATE TABLE IF NOT EXISTS media_blob_cache (
    client_message_id   TEXT PRIMARY KEY,
    ciphertext_b64      TEXT NOT NULL,
    created_at          INTEGER NOT NULL,
    expires_at          INTEGER NOT NULL,
    byte_length         INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_media_blob_cache_expires
  ON media_blob_cache (expires_at);

ALTER TABLE message_outbox ADD COLUMN payload_kind TEXT NOT NULL DEFAULT 'text';
ALTER TABLE message_outbox ADD COLUMN media_attachment_id TEXT;
ALTER TABLE message_outbox ADD COLUMN media_blob_cached INTEGER NOT NULL DEFAULT 0;
`;
