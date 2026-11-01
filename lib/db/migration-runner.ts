import { MIGRATIONS_TABLE } from "./constants";
import type { IDatabase } from "./database-types";
import { MIGRATION_001_SQL } from "./migrations/001-initial";
import { MIGRATION_002_SQL } from "./migrations/002-key-material";
import { MIGRATION_003_SQL } from "./migrations/003-reactions";
import { MIGRATION_004_SQL } from "./migrations/004-media";
import { MIGRATION_005_SQL } from "./migrations/005-identity-trust";
import { MIGRATION_006_SQL } from "./migrations/006-envelope-quarantine";
import { MIGRATION_007_SQL } from "./migrations/007-message-outbox";
import { splitStatements } from "./sql-utils";

const MIGRATIONS: { version: number; sql: string }[] = [
  { version: 1, sql: MIGRATION_001_SQL },
  { version: 2, sql: MIGRATION_002_SQL },
  { version: 3, sql: MIGRATION_003_SQL },
  { version: 4, sql: MIGRATION_004_SQL },
  { version: 5, sql: MIGRATION_005_SQL },
  { version: 6, sql: MIGRATION_006_SQL },
  { version: 7, sql: MIGRATION_007_SQL },
];

export class MigrationRunner {
  async runMigrations(db: IDatabase): Promise<void> {
    await db.run(
      `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      )`,
    );
    const row = await db.getFirst<{ version: number | null }>(
      `SELECT MAX(version) as version FROM ${MIGRATIONS_TABLE}`,
    );
    const current = row?.version ?? 0;

    for (const m of MIGRATIONS) {
      if (m.version <= current) continue;
      await db.withTransaction(async () => {
        for (const stmt of splitStatements(m.sql)) {
          await db.run(stmt);
        }
        await db.run(
          `INSERT INTO ${MIGRATIONS_TABLE} (version, applied_at) VALUES (?, ?)`,
          [m.version, Date.now()],
        );
      });
    }
  }
}
