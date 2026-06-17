import * as SQLite from "expo-sqlite";

import { DB_NAME } from "./constants";
import type { IDatabase, RunResult, SqlParams } from "./database-types";
import { MigrationRunner } from "./migration-runner";
import { escapeSqlString } from "./sql-utils";

export type { IDatabase, RunResult, SqlParams } from "./database-types";

const BUSY_TIMEOUT_MS = 5000;

export class SqlCipherDatabase implements IDatabase {
  private db: SQLite.SQLiteDatabase | null = null;
  private mutex: Promise<void> = Promise.resolve();
  private depth = 0;

  /** Serialize all DB access; re-entrant while inside withTransaction. */
  private async serialize<T>(fn: () => Promise<T>): Promise<T> {
    if (this.depth > 0) {
      return fn();
    }
    const previous = this.mutex;
    let release!: () => void;
    this.mutex = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    this.depth++;
    try {
      return await fn();
    } finally {
      this.depth--;
      release();
    }
  }

  async open(passphrase: string): Promise<void> {
    if (this.db) return;
    this.db = await SQLite.openDatabaseAsync(DB_NAME);
    await this.db.execAsync(
      `PRAGMA key = '${escapeSqlString(passphrase)}'`,
    );
    await this.db.execAsync("PRAGMA foreign_keys = ON");
    await this.db.execAsync("PRAGMA cipher_memory_security = ON");
    await this.db.execAsync(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
    const runner = new MigrationRunner();
    const self: IDatabase = this;
    await runner.runMigrations(self);
    await this.getFirst("SELECT count(*) as c FROM sqlite_master");
  }

  async close(): Promise<void> {
    await this.serialize(async () => {
      await this.db?.closeAsync();
      this.db = null;
    });
  }

  isOpen(): boolean {
    return this.db !== null;
  }

  async run(sql: string, params: SqlParams = []): Promise<RunResult> {
    return this.serialize(async () => {
      if (!this.db) throw new Error("DB not open");
      const result = await this.db.runAsync(sql, params);
      return {
        changes: result.changes,
        lastInsertRowId: result.lastInsertRowId,
      };
    });
  }

  async getFirst<T>(sql: string, params: SqlParams = []): Promise<T | null> {
    return this.serialize(async () => {
      if (!this.db) throw new Error("DB not open");
      return (await this.db.getFirstAsync<T>(sql, params)) ?? null;
    });
  }

  async getAll<T>(sql: string, params: SqlParams = []): Promise<T[]> {
    return this.serialize(async () => {
      if (!this.db) throw new Error("DB not open");
      return this.db.getAllAsync<T>(sql, params);
    });
  }

  async withTransaction<T>(fn: () => Promise<T>): Promise<T> {
    return this.serialize(async () => {
      if (!this.db) throw new Error("DB not open");
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
