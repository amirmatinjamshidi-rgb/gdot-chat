import type { LocalIdentity, RemoteIdentity } from "./types";
import type { IDatabase } from "./database-types";

export interface IIdentityStore {
  getLocalIdentity(): Promise<LocalIdentity | null>;
  saveLocalIdentity(identity: LocalIdentity): Promise<void>;
  getRemoteIdentity(peerAddressId: string): Promise<RemoteIdentity | null>;
  saveRemoteIdentity(identity: RemoteIdentity): Promise<void>;
  setVerified(peerAddressId: string, verified: boolean): Promise<void>;
  setKeyChanged(peerAddressId: string, keyChanged: boolean): Promise<void>;
}

type LocalIdentityRow = {
  user_id: string;
  device_id: string;
  username: string;
  registration_id: number;
  identity_key_public: Uint8Array;
  created_at: number;
};

type RemoteIdentityRow = {
  peer_device_id: string;
  peer_user_id: string;
  identity_key_public: Uint8Array;
  safety_number: string;
  verified: number;
  key_changed?: number | null;
  last_key_fingerprint: string;
};

export class IdentityStore implements IIdentityStore {
  constructor(private readonly db: IDatabase) {}

  async getLocalIdentity(): Promise<LocalIdentity | null> {
    const row = await this.db.getFirst<LocalIdentityRow>(
      `SELECT user_id, device_id, username, registration_id, identity_key_public, created_at
       FROM local_identity WHERE id = 1`,
    );
    if (!row) return null;
    return {
      userId: row.user_id,
      deviceId: row.device_id,
      username: row.username,
      registrationId: row.registration_id,
      identityKeyPublic: row.identity_key_public,
      createdAt: row.created_at,
    };
  }

  async saveLocalIdentity(identity: LocalIdentity): Promise<void> {
    await this.db.run(
      `INSERT OR REPLACE INTO local_identity
       (id, user_id, device_id, username, registration_id, identity_key_public, created_at)
       VALUES (1,?,?,?,?,?,?)`,
      [
        identity.userId,
        identity.deviceId,
        identity.username,
        identity.registrationId,
        identity.identityKeyPublic,
        Date.now(),
      ],
    );
  }

  async getRemoteIdentity(peerAddressId: string): Promise<RemoteIdentity | null> {
    const row = await this.db.getFirst<RemoteIdentityRow>(
      `SELECT * FROM remote_identities WHERE peer_device_id = ?`,
      [peerAddressId],
    );
    if (!row) return null;
    return {
      peerUserId: row.peer_user_id,
      peerDeviceId: row.peer_device_id,
      identityKeyPublic: row.identity_key_public,
      safetyNumber: row.safety_number,
      verified: row.verified === 1,
      keyChanged: (row.key_changed ?? 0) === 1,
      lastSeenKeyFingerprint: row.last_key_fingerprint,
    };
  }

  async saveRemoteIdentity(identity: RemoteIdentity): Promise<void> {
    await this.db.run(
      `INSERT OR REPLACE INTO remote_identities
       (peer_device_id, peer_user_id, identity_key_public, safety_number, verified,
        key_changed, last_key_fingerprint, updated_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        identity.peerDeviceId,
        identity.peerUserId,
        identity.identityKeyPublic,
        identity.safetyNumber,
        identity.verified ? 1 : 0,
        identity.keyChanged ? 1 : 0,
        identity.lastSeenKeyFingerprint,
        Date.now(),
      ],
    );
  }

  async setVerified(peerAddressId: string, verified: boolean): Promise<void> {
    await this.db.run(
      `UPDATE remote_identities SET verified = ? WHERE peer_device_id = ?`,
      [verified ? 1 : 0, peerAddressId],
    );
  }

  async setKeyChanged(peerAddressId: string, keyChanged: boolean): Promise<void> {
    await this.db.run(
      `UPDATE remote_identities SET key_changed = ? WHERE peer_device_id = ?`,
      [keyChanged ? 1 : 0, peerAddressId],
    );
  }
}
