/** SQLCipher schema migration 005 — identity key change trust flag */
export const MIGRATION_005_SQL = `
ALTER TABLE remote_identities ADD COLUMN key_changed INTEGER NOT NULL DEFAULT 0;
`;
