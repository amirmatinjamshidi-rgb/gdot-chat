import type { SessionRecord } from "@/lib/crypto/types";

import type { IDatabase } from "./database";

export interface ISessionStore {
  get(peerDeviceId: string): Promise<SessionRecord | null>;
  save(peerDeviceId: string, record: SessionRecord): Promise<void>;
  delete(peerDeviceId: string): Promise<void>;
}

type SessionRow = {
  peer_device_id: string;
  session_blob: Uint8Array;
  updated_at: number;
};

export class SessionStore implements ISessionStore {
  constructor(private readonly db: IDatabase) {}

  async get(peerDeviceId: string): Promise<SessionRecord | null> {
    const row = await this.db.getFirst<SessionRow>(
      `SELECT session_blob, peer_device_id FROM signal_sessions WHERE peer_device_id = ?`,
      [peerDeviceId],
    );
    if (!row) return null;
    return {
      peerDeviceId: row.peer_device_id,
      serialized: row.session_blob,
    };
  }

  async save(peerDeviceId: string, record: SessionRecord): Promise<void> {
    await this.db.run(
      `INSERT OR REPLACE INTO signal_sessions (peer_device_id, session_blob, updated_at)
       VALUES (?,?,?)`,
      [peerDeviceId, record.serialized, Date.now()],
    );
  }

  async delete(peerDeviceId: string): Promise<void> {
    await this.db.run(
      `DELETE FROM signal_sessions WHERE peer_device_id = ?`,
      [peerDeviceId],
    );
  }
}
