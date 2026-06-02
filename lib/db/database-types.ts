export type SqlParams = (string | number | null | boolean | Uint8Array)[];

export interface RunResult {
  changes: number;
  lastInsertRowId: number;
}

export interface IDatabase {
  open(passphrase: string): Promise<void>;
  close(): Promise<void>;
  isOpen(): boolean;
  run(sql: string, params?: SqlParams): Promise<RunResult>;
  getFirst<T>(sql: string, params?: SqlParams): Promise<T | null>;
  getAll<T>(sql: string, params?: SqlParams): Promise<T[]>;
  withTransaction<T>(fn: () => Promise<T>): Promise<T>;
}
