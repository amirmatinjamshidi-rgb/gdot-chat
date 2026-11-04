/**
 * Columns needed to render a chat bubble / feed row.
 * Excludes ciphertext (BLOB) and message_type — those are only for encrypt/send paths.
 */
export const MESSAGE_LIST_COLUMNS = [
  "id",
  "client_id",
  "conversation_id",
  "direction",
  "kind",
  "plaintext",
  "status",
  "sender_device_id",
  "sender_user_id",
  "server_envelope_id",
  "created_at",
  "attachment_id",
] as const;

export const MESSAGE_LIST_SELECT = MESSAGE_LIST_COLUMNS.join(", ");

/** Full-row select for getById / getByClientId / encrypt paths. */
export const MESSAGE_FULL_SELECT = "*";
