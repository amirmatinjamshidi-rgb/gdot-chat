/** SQLCipher schema migration 013 — group outbox + media at-rest flags */
export const MIGRATION_013_SQL = `
ALTER TABLE message_outbox ADD COLUMN group_id TEXT;
CREATE INDEX IF NOT EXISTS idx_message_outbox_group_pending
  ON message_outbox (group_id, receipted_at, created_at)
  WHERE group_id IS NOT NULL;

ALTER TABLE local_attachments ADD COLUMN group_id TEXT;
ALTER TABLE local_attachments ADD COLUMN at_rest_encrypted INTEGER NOT NULL DEFAULT 0;
`;
