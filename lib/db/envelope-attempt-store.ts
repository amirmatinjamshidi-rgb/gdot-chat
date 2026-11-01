import type { IDatabase } from "./database-types";
import {
  ENVELOPE_MAX_ATTEMPT_AGE_MS,
  ENVELOPE_MAX_ATTEMPTS,
} from "@/lib/session/inbound/constants";

export type EnvelopeAttemptRecord = {
  serverEnvelopeId: string;
  attemptCount: number;
  firstAttemptAt: number;
  lastAttemptAt: number;
  lastErrorClass: string;
  lastErrorName: string;
};

export interface IEnvelopeAttemptStore {
  recordAttempt(
    serverEnvelopeId: string,
    errorClass: string,
    errorName: string,
    now: number,
  ): Promise<EnvelopeAttemptRecord>;
  get(serverEnvelopeId: string): Promise<EnvelopeAttemptRecord | null>;
  clear(serverEnvelopeId: string): Promise<void>;
  /** True when transient should be promoted to permanent. */
  isExhausted(record: EnvelopeAttemptRecord, now: number): boolean;
}

type Row = {
  server_envelope_id: string;
  attempt_count: number;
  first_attempt_at: number;
  last_attempt_at: number;
  last_error_class: string;
  last_error_name: string;
};

function mapRow(row: Row): EnvelopeAttemptRecord {
  return {
    serverEnvelopeId: row.server_envelope_id,
    attemptCount: row.attempt_count,
    firstAttemptAt: row.first_attempt_at,
    lastAttemptAt: row.last_attempt_at,
    lastErrorClass: row.last_error_class,
    lastErrorName: row.last_error_name,
  };
}

export class EnvelopeAttemptStore implements IEnvelopeAttemptStore {
  constructor(private readonly db: IDatabase) {}

  async recordAttempt(
    serverEnvelopeId: string,
    errorClass: string,
    errorName: string,
    now: number,
  ): Promise<EnvelopeAttemptRecord> {
    const existing = await this.get(serverEnvelopeId);
    if (!existing) {
      await this.db.run(
        `INSERT INTO envelope_attempts (
           server_envelope_id, attempt_count, first_attempt_at, last_attempt_at,
           last_error_class, last_error_name
         ) VALUES (?,?,?,?,?,?)`,
        [serverEnvelopeId, 1, now, now, errorClass, errorName],
      );
      return {
        serverEnvelopeId,
        attemptCount: 1,
        firstAttemptAt: now,
        lastAttemptAt: now,
        lastErrorClass: errorClass,
        lastErrorName: errorName,
      };
    }
    const next = existing.attemptCount + 1;
    await this.db.run(
      `UPDATE envelope_attempts SET attempt_count = ?, last_attempt_at = ?,
         last_error_class = ?, last_error_name = ?
       WHERE server_envelope_id = ?`,
      [next, now, errorClass, errorName, serverEnvelopeId],
    );
    return {
      ...existing,
      attemptCount: next,
      lastAttemptAt: now,
      lastErrorClass: errorClass,
      lastErrorName: errorName,
    };
  }

  async get(serverEnvelopeId: string): Promise<EnvelopeAttemptRecord | null> {
    const row = await this.db.getFirst<Row>(
      `SELECT * FROM envelope_attempts WHERE server_envelope_id = ?`,
      [serverEnvelopeId],
    );
    return row ? mapRow(row) : null;
  }

  async clear(serverEnvelopeId: string): Promise<void> {
    await this.db.run(
      `DELETE FROM envelope_attempts WHERE server_envelope_id = ?`,
      [serverEnvelopeId],
    );
  }

  isExhausted(record: EnvelopeAttemptRecord, now: number): boolean {
    if (record.attemptCount >= ENVELOPE_MAX_ATTEMPTS) return true;
    if (now - record.firstAttemptAt >= ENVELOPE_MAX_ATTEMPT_AGE_MS) return true;
    return false;
  }
}

export class MemoryEnvelopeAttemptStore implements IEnvelopeAttemptStore {
  private map = new Map<string, EnvelopeAttemptRecord>();

  async recordAttempt(
    serverEnvelopeId: string,
    errorClass: string,
    errorName: string,
    now: number,
  ): Promise<EnvelopeAttemptRecord> {
    const existing = this.map.get(serverEnvelopeId);
    if (!existing) {
      const rec: EnvelopeAttemptRecord = {
        serverEnvelopeId,
        attemptCount: 1,
        firstAttemptAt: now,
        lastAttemptAt: now,
        lastErrorClass: errorClass,
        lastErrorName: errorName,
      };
      this.map.set(serverEnvelopeId, rec);
      return { ...rec };
    }
    const next = {
      ...existing,
      attemptCount: existing.attemptCount + 1,
      lastAttemptAt: now,
      lastErrorClass: errorClass,
      lastErrorName: errorName,
    };
    this.map.set(serverEnvelopeId, next);
    return { ...next };
  }

  async get(serverEnvelopeId: string): Promise<EnvelopeAttemptRecord | null> {
    const r = this.map.get(serverEnvelopeId);
    return r ? { ...r } : null;
  }

  async clear(serverEnvelopeId: string): Promise<void> {
    this.map.delete(serverEnvelopeId);
  }

  isExhausted(record: EnvelopeAttemptRecord, now: number): boolean {
    if (record.attemptCount >= ENVELOPE_MAX_ATTEMPTS) return true;
    if (now - record.firstAttemptAt >= ENVELOPE_MAX_ATTEMPT_AGE_MS) return true;
    return false;
  }
}

export class MemorySessionResetCooldownStore {
  private last = new Map<string, number>();

  canSend(peerDeviceId: string, now: number, cooldownMs: number): boolean {
    const prev = this.last.get(peerDeviceId);
    if (prev == null) return true;
    return now - prev >= cooldownMs;
  }

  markSent(peerDeviceId: string, now: number): void {
    this.last.set(peerDeviceId, now);
  }
}

