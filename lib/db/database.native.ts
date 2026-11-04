import * as SQLite from "expo-sqlite";

import { DB_NAME } from "./constants";
import type { IDatabase, RunResult, SqlParams } from "./database-types";
import { DbLockedError } from "./db-errors";
import { DbOperationGate } from "./db-operation-gate";
import { MigrationRunner } from "./migration-runner";
import { sqlcipherPostKeyPragmas } from "./sqlcipher-open-pragmas";
import { escapeSqlString } from "./sql-utils";

export type { IDatabase, RunResult, SqlParams } from "./database-types";
export { DbLockedError, isDbLockedError, isQuietDbCancel } from "./db-errors";

const BUSY_TIMEOUT_MS = 5000;

export class SqlCipherDatabase implements IDatabase {
  private db: SQLite.SQLiteDatabase | null = null;
  private readonly gate = new DbOperationGate();

  async open(passphrase: string): Promise<void> {
    if (this.db) {
      this.gate.markOpen();
      return;
    }
    this.gate.markOpen();
    this.db = await SQLite.openDatabaseAsync(DB_NAME);
    await this.db.execAsync(
      `PRAGMA key = '${escapeSqlString(passphrase)}'`,
    );
    for (const pragma of sqlcipherPostKeyPragmas(BUSY_TIMEOUT_MS)) {
      await this.db.execAsync(pragma);
    }
    const secureRow = await this.db.getFirstAsync<{ secure_delete: number }>(
      "PRAGMA secure_delete",
    );
    const secureDelete = secureRow
      ? Number(
          (secureRow as { secure_delete?: number }).secure_delete ??
            Object.values(secureRow)[0],
        )
      : NaN;
    if (secureDelete !== 1) {
      throw new Error(
        `PRAGMA secure_delete expected 1 after open, got ${String(secureDelete)}`,
      );
    }
    if (__DEV__) {
      console.log("[SqlCipher] PRAGMA secure_delete =", secureDelete);
    }
    const runner = new MigrationRunner();
    const self: IDatabase = this;
    await runner.runMigrations(self);
    await this.getFirst("SELECT count(*) as c FROM sqlite_master");
  }

  async close(): Promise<void> {
    await this.gate.closeExclusive(async () => {
      if (!this.db) return;
      await this.db.closeAsync();
      this.db = null;
    });
  }

  async deleteDatabase(): Promise<void> {
    if (this.db) {
      await this.close();
    }
    try {
      await SQLite.deleteDatabaseAsync(DB_NAME);
    } catch (e) {
      // Fresh installs have no on-disk DB yet; treat missing file as success.
      const msg = e instanceof Error ? e.message : String(e);
      if (!/not found/i.test(msg)) throw e;
    }
  }

  isOpen(): boolean {
    return this.db !== null;
  }

  async run(sql: string, params: SqlParams = []): Promise<RunResult> {
    return this.gate.runExclusive(async () => {
      if (!this.db) throw new DbLockedError();
      const result = await this.db.runAsync(sql, params);
      return {
        changes: result.changes,
        lastInsertRowId: result.lastInsertRowId,
      };
    });
  }

  async getFirst<T>(sql: string, params: SqlParams = []): Promise<T | null> {
    return this.gate.runExclusive(async () => {
      if (!this.db) throw new DbLockedError();
      return (await this.db.getFirstAsync<T>(sql, params)) ?? null;
    });
  }

  async getAll<T>(sql: string, params: SqlParams = []): Promise<T[]> {
    return this.gate.runExclusive(async () => {
      if (!this.db) throw new DbLockedError();
      return this.db.getAllAsync<T>(sql, params);
    });
  }

  async withTransaction<T>(fn: () => Promise<T>): Promise<T> {
    return this.gate.runExclusive(async () => {
      if (!this.db) throw new DbLockedError();
      await this.db.runAsync("BEGIN IMMEDIATE");
      try {
        const result = await fn();
        await this.db.runAsync("COMMIT");
        return result;
      } catch (e) {
        await this.db.runAsync("ROLLBACK");
        throw e;
      }
    });
  }
}

export const sqlCipherDatabase = new SqlCipherDatabase();
