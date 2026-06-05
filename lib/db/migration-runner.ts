import { MIGRATIONS_TABLE } from "./constants";
import type { IDatabase } from "./database-types";
import { MIGRATION_001_SQL } from "./migrations/001-initial";
import { MIGRATION_002_SQL } from "./migrations/002-key-material";
import { splitStatements } from "./sql-utils";

const MIGRATIONS: { version: number; sql: string }[] = [
  { version: 1, sql: MIGRATION_001_SQL },
  { version: 2, sql: MIGRATION_002_SQL },
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
