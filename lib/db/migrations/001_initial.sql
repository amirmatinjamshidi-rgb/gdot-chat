PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS local_identity (
    id                  INTEGER PRIMARY KEY CHECK (id = 1),
    user_id             TEXT NOT NULL,
    device_id           TEXT NOT NULL,
    username            TEXT NOT NULL,
    registration_id     INTEGER NOT NULL,
    identity_key_public BLOB NOT NULL,
    created_at          INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS remote_identities (
    peer_device_id          TEXT PRIMARY KEY,
    peer_user_id            TEXT NOT NULL,
    identity_key_public     BLOB NOT NULL,
    safety_number           TEXT NOT NULL,
    verified                INTEGER NOT NULL DEFAULT 0,
    last_key_fingerprint    TEXT NOT NULL,
    updated_at              INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS signal_sessions (
    peer_device_id      TEXT PRIMARY KEY,
    session_blob        BLOB NOT NULL,
    updated_at          INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
    id                  TEXT PRIMARY KEY,
    peer_user_id        TEXT NOT NULL UNIQUE,
    peer_username       TEXT NOT NULL,
    peer_device_id      TEXT NOT NULL,
    last_message_preview TEXT NOT NULL DEFAULT '',
    last_message_at     INTEGER NOT NULL DEFAULT 0,
    unread_count        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS messages (
    id                  TEXT PRIMARY KEY,
    client_id           TEXT NOT NULL UNIQUE,
    conversation_id     TEXT NOT NULL,
    direction           TEXT NOT NULL CHECK (direction IN ('incoming','outgoing')),
    plaintext           TEXT NOT NULL,
    ciphertext          BLOB,
    message_type        INTEGER,
    status              TEXT NOT NULL,
    sender_device_id    TEXT NOT NULL,
    server_envelope_id  TEXT,
    created_at          INTEGER NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_pending ON messages (status) WHERE status = 'pending';
