/** SQLCipher schema migration 011 — E2EE groups + sender-key state */
export const MIGRATION_011_SQL = `
CREATE TABLE IF NOT EXISTS local_groups (
    id                  TEXT PRIMARY KEY,
    encrypted_metadata  TEXT,
    created_by_user_id  TEXT NOT NULL,
    created_at          INTEGER NOT NULL,
    my_role             TEXT NOT NULL,
    last_message_preview TEXT NOT NULL DEFAULT '',
    last_message_at     INTEGER NOT NULL DEFAULT 0,
    unread_count        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS local_group_members (
    group_id     TEXT NOT NULL,
    user_id      TEXT NOT NULL,
    username     TEXT NOT NULL DEFAULT '',
    role         TEXT NOT NULL,
    joined_at    INTEGER NOT NULL,
    left_at      INTEGER,
    PRIMARY KEY (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_local_group_members_active
  ON local_group_members (group_id, left_at);

CREATE TABLE IF NOT EXISTS sender_key_states (
    group_id          TEXT NOT NULL,
    sender_user_id    TEXT NOT NULL,
    sender_device_id  TEXT NOT NULL,
    key_id            INTEGER NOT NULL,
    iteration         INTEGER NOT NULL,
    chain_key         BLOB NOT NULL,
    mac_key           BLOB NOT NULL,
    is_own            INTEGER NOT NULL DEFAULT 0,
    updated_at        INTEGER NOT NULL,
    PRIMARY KEY (group_id, sender_user_id, sender_device_id, key_id)
);

CREATE INDEX IF NOT EXISTS idx_sender_key_states_lookup
  ON sender_key_states (group_id, sender_user_id, sender_device_id);

CREATE TABLE IF NOT EXISTS group_message_buffer (
    id                 TEXT PRIMARY KEY,
    group_id           TEXT NOT NULL,
    sender_user_id     TEXT NOT NULL,
    sender_device_id   TEXT NOT NULL,
    key_id             INTEGER NOT NULL,
    iteration          INTEGER NOT NULL,
    wire_json          TEXT NOT NULL,
    envelope_id        TEXT,
    created_at         INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_group_message_buffer_due
  ON group_message_buffer (group_id, sender_user_id, sender_device_id, key_id, iteration);
`;
