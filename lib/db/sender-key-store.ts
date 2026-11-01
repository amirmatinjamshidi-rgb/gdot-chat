import type { SenderKeyState } from "@/lib/crypto/sender-keys";
import type { IDatabase } from "./database-types";

export type StoredSenderKey = SenderKeyState & {
  groupId: string;
  senderUserId: string;
  senderDeviceId: string;
  isOwn: boolean;
  updatedAt: number;
};

export interface ISenderKeyStore {
  upsert(row: StoredSenderKey): Promise<void>;
  get(
    groupId: string,
    senderUserId: string,
    senderDeviceId: string,
    keyId?: number,
  ): Promise<StoredSenderKey | null>;
  getOwn(groupId: string, senderUserId: string, senderDeviceId: string): Promise<StoredSenderKey | null>;
  listForGroup(groupId: string): Promise<StoredSenderKey[]>;
  deleteOwn(groupId: string, senderUserId: string, senderDeviceId: string): Promise<void>;
}

type Row = {
  group_id: string;
  sender_user_id: string;
  sender_device_id: string;
  key_id: number;
  iteration: number;
  chain_key: Uint8Array;
  mac_key: Uint8Array;
  is_own: number;
  updated_at: number;
};

function map(row: Row): StoredSenderKey {
  return {
    groupId: row.group_id,
    senderUserId: row.sender_user_id,
    senderDeviceId: row.sender_device_id,
    keyId: row.key_id,
    iteration: row.iteration,
    chainKey: row.chain_key,
    macKey: row.mac_key,
    isOwn: row.is_own === 1,
    updatedAt: row.updated_at,
  };
}

export class SenderKeyStore implements ISenderKeyStore {
  constructor(private readonly db: IDatabase) {}

  async upsert(row: StoredSenderKey): Promise<void> {
    await this.db.run(
      `INSERT INTO sender_key_states (
         group_id, sender_user_id, sender_device_id, key_id, iteration,
         chain_key, mac_key, is_own, updated_at
       ) VALUES (?,?,?,?,?,?,?,?,?)
       ON CONFLICT(group_id, sender_user_id, sender_device_id, key_id) DO UPDATE SET
         iteration=excluded.iteration,
         chain_key=excluded.chain_key,
         mac_key=excluded.mac_key,
         is_own=excluded.is_own,
         updated_at=excluded.updated_at`,
      [
        row.groupId,
        row.senderUserId,
        row.senderDeviceId,
        row.keyId,
        row.iteration,
        row.chainKey,
        row.macKey,
        row.isOwn ? 1 : 0,
        row.updatedAt,
      ],
    );
  }

  async get(
    groupId: string,
    senderUserId: string,
    senderDeviceId: string,
    keyId?: number,
  ): Promise<StoredSenderKey | null> {
    if (keyId !== undefined) {
      const row = await this.db.getFirst<Row>(
        `SELECT * FROM sender_key_states
         WHERE group_id=? AND sender_user_id=? AND sender_device_id=? AND key_id=?`,
        [groupId, senderUserId, senderDeviceId, keyId],
      );
      return row ? map(row) : null;
    }
    const row = await this.db.getFirst<Row>(
      `SELECT * FROM sender_key_states
       WHERE group_id=? AND sender_user_id=? AND sender_device_id=?
       ORDER BY updated_at DESC LIMIT 1`,
      [groupId, senderUserId, senderDeviceId],
    );
    return row ? map(row) : null;
  }

  async getOwn(
    groupId: string,
    senderUserId: string,
    senderDeviceId: string,
  ): Promise<StoredSenderKey | null> {
    const row = await this.db.getFirst<Row>(
      `SELECT * FROM sender_key_states
       WHERE group_id=? AND sender_user_id=? AND sender_device_id=? AND is_own=1
       ORDER BY updated_at DESC LIMIT 1`,
      [groupId, senderUserId, senderDeviceId],
    );
    return row ? map(row) : null;
  }

  async listForGroup(groupId: string): Promise<StoredSenderKey[]> {
    const rows = await this.db.getAll<Row>(
      `SELECT * FROM sender_key_states WHERE group_id=?`,
      [groupId],
    );
    return rows.map(map);
  }

  async deleteOwn(
    groupId: string,
    senderUserId: string,
    senderDeviceId: string,
  ): Promise<void> {
    await this.db.run(
      `DELETE FROM sender_key_states
       WHERE group_id=? AND sender_user_id=? AND sender_device_id=? AND is_own=1`,
      [groupId, senderUserId, senderDeviceId],
    );
  }
}

export class MemorySenderKeyStore implements ISenderKeyStore {
  private readonly rows = new Map<string, StoredSenderKey>();

  private key(
    groupId: string,
    senderUserId: string,
    senderDeviceId: string,
    keyId: number,
  ) {
    return `${groupId}|${senderUserId}|${senderDeviceId}|${keyId}`;
  }

  async upsert(row: StoredSenderKey): Promise<void> {
    this.rows.set(
      this.key(row.groupId, row.senderUserId, row.senderDeviceId, row.keyId),
      { ...row, chainKey: new Uint8Array(row.chainKey), macKey: new Uint8Array(row.macKey) },
    );
  }

  async get(
    groupId: string,
    senderUserId: string,
    senderDeviceId: string,
    keyId?: number,
  ): Promise<StoredSenderKey | null> {
    if (keyId !== undefined) {
      return (
        this.rows.get(this.key(groupId, senderUserId, senderDeviceId, keyId)) ??
        null
      );
    }
    const matches = [...this.rows.values()]
      .filter(
        (r) =>
          r.groupId === groupId &&
          r.senderUserId === senderUserId &&
          r.senderDeviceId === senderDeviceId,
      )
      .sort((a, b) => b.updatedAt - a.updatedAt);
    return matches[0] ?? null;
  }

  async getOwn(
    groupId: string,
    senderUserId: string,
    senderDeviceId: string,
  ): Promise<StoredSenderKey | null> {
    const matches = [...this.rows.values()]
      .filter(
        (r) =>
          r.groupId === groupId &&
          r.senderUserId === senderUserId &&
          r.senderDeviceId === senderDeviceId &&
          r.isOwn,
      )
      .sort((a, b) => b.updatedAt - a.updatedAt);
    return matches[0] ?? null;
  }

  async listForGroup(groupId: string): Promise<StoredSenderKey[]> {
    return [...this.rows.values()].filter((r) => r.groupId === groupId);
  }

  async deleteOwn(
    groupId: string,
    senderUserId: string,
    senderDeviceId: string,
  ): Promise<void> {
    for (const [k, r] of this.rows) {
      if (
        r.groupId === groupId &&
        r.senderUserId === senderUserId &&
        r.senderDeviceId === senderDeviceId &&
        r.isOwn
      ) {
        this.rows.delete(k);
      }
    }
  }
}
