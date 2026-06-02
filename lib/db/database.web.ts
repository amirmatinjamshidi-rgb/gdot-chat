import type { IDatabase, RunResult, SqlParams } from "./database-types";

export type { IDatabase, RunResult, SqlParams } from "./database-types";

const WEB_MESSAGE =
  "Encrypted SQLite is only available in the iOS/Android development build, not in the web bundle.";

export class SqlCipherDatabase implements IDatabase {
  async open(): Promise<void> {
    throw new Error(WEB_MESSAGE);
  }

  async close(): Promise<void> {}

  isOpen(): boolean {
    return false;
  }

  async run(): Promise<RunResult> {
    throw new Error(WEB_MESSAGE);
  }

  async getFirst<T>(): Promise<T | null> {
    throw new Error(WEB_MESSAGE);
  }

  async getAll<T>(): Promise<T[]> {
    throw new Error(WEB_MESSAGE);
  }

  async withTransaction<T>(): Promise<T> {
    throw new Error(WEB_MESSAGE);
  }
}

export const sqlCipherDatabase = new SqlCipherDatabase();
