import type { PreKey, SignedPreKey } from "@/lib/crypto/types";

import type { IDatabase } from "./database-types";

export interface ICryptoKeyStore {
  getIdentityPrivateKey(): Promise<Uint8Array | null>;
  saveIdentityPrivateKey(privateKey: Uint8Array): Promise<void>;
  getSignedPreKey(keyId: number): Promise<SignedPreKey | null>;
  saveSignedPreKey(key: SignedPreKey): Promise<void>;
  getOneTimePreKey(keyId: number): Promise<PreKey | null>;
  saveOneTimePreKeys(keys: PreKey[]): Promise<void>;
  getNextOtkKeyId(): Promise<number>;
  setNextOtkKeyId(nextId: number): Promise<void>;
}

type PreKeyRow = {
  key_id: number;
  key_type: string;
  public_key: Uint8Array;
  private_key: Uint8Array;
  signature: Uint8Array | null;
};

export class CryptoKeyStore implements ICryptoKeyStore {
  constructor(private readonly db: IDatabase) {}

  async getIdentityPrivateKey(): Promise<Uint8Array | null> {
    const row = await this.db.getFirst<{ identity_key_private: Uint8Array | null }>(
      `SELECT identity_key_private FROM local_identity WHERE id = 1`,
    );
    return row?.identity_key_private ?? null;
  }

  async saveIdentityPrivateKey(privateKey: Uint8Array): Promise<void> {
    await this.db.run(
      `UPDATE local_identity SET identity_key_private = ? WHERE id = 1`,
      [privateKey],
    );
  }

  async getSignedPreKey(keyId: number): Promise<SignedPreKey | null> {
    const row = await this.db.getFirst<PreKeyRow>(
      `SELECT * FROM crypto_prekeys WHERE key_type = 'signed' AND key_id = ?`,
      [keyId],
    );
    if (!row) return null;
    return {
      keyId: row.key_id,
      publicKey: row.public_key,
      privateKey: row.private_key,
      signature: row.signature ?? new Uint8Array(0),
    };
  }

  async saveSignedPreKey(key: SignedPreKey): Promise<void> {
    await this.db.run(
      `INSERT OR REPLACE INTO crypto_prekeys
       (key_id, key_type, public_key, private_key, signature, consumed)
       VALUES (?, 'signed', ?, ?, ?, 0)`,
      [key.keyId, key.publicKey, key.privateKey, key.signature],
    );
  }

  async getOneTimePreKey(keyId: number): Promise<PreKey | null> {
    const row = await this.db.getFirst<PreKeyRow>(
      `SELECT * FROM crypto_prekeys WHERE key_type = 'onetime' AND key_id = ? AND consumed = 0`,
      [keyId],
    );
    if (!row) return null;
    return {
      keyId: row.key_id,
      publicKey: row.public_key,
      privateKey: row.private_key,
    };
  }

  async saveOneTimePreKeys(keys: PreKey[]): Promise<void> {
    if (keys.length === 0) return;
    await this.db.withTransaction(async () => {
      for (const k of keys) {
        await this.db.run(
          `INSERT OR REPLACE INTO crypto_prekeys
           (key_id, key_type, public_key, private_key, signature, consumed)
           VALUES (?, 'onetime', ?, ?, NULL, 0)`,
          [k.keyId, k.publicKey, k.privateKey],
        );
      }
    });
  }

  async getNextOtkKeyId(): Promise<number> {
    const row = await this.db.getFirst<{ next_key_id: number }>(
      `SELECT next_key_id FROM otk_upload_state WHERE id = 1`,
    );
    return row?.next_key_id ?? 1;
  }

  async setNextOtkKeyId(nextId: number): Promise<void> {
    await this.db.run(
      `INSERT OR REPLACE INTO otk_upload_state (id, next_key_id) VALUES (1, ?)`,
      [nextId],
    );
  }
}
