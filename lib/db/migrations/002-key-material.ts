/** SQLCipher schema migration 002 — key material, profile, drafts */
export const MIGRATION_002_SQL = `
ALTER TABLE local_identity ADD COLUMN identity_key_private BLOB;

CREATE TABLE IF NOT EXISTS local_profile (
    id              INTEGER PRIMARY KEY CHECK (id = 1),
    display_name    TEXT NOT NULL DEFAULT '',
    bio             TEXT NOT NULL DEFAULT '',
    phone_e164      TEXT NOT NULL DEFAULT '',
    birthday        TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS crypto_prekeys (
    key_id          INTEGER NOT NULL,
    key_type        TEXT NOT NULL CHECK (key_type IN ('signed', 'onetime')),
    public_key      BLOB NOT NULL,
    private_key     BLOB NOT NULL,
    signature       BLOB,
    consumed        INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (key_type, key_id)
);

CREATE TABLE IF NOT EXISTS composer_drafts (
    conversation_id TEXT PRIMARY KEY,
    draft_text      TEXT NOT NULL DEFAULT '',
    updated_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS otk_upload_state (
    id              INTEGER PRIMARY KEY CHECK (id = 1),
    next_key_id     INTEGER NOT NULL DEFAULT 1
);
`;
