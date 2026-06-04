import type { LocalIdentity, RemoteIdentity } from "./types";
import type { IDatabase } from "./database-types";

export interface IIdentityStore {
  getLocalIdentity(): Promise<LocalIdentity | null>;
  saveLocalIdentity(identity: LocalIdentity): Promise<void>;
  getRemoteIdentity(peerDeviceId: string): Promise<RemoteIdentity | null>;
  saveRemoteIdentity(identity: RemoteIdentity): Promise<void>;
  setVerified(peerDeviceId: string, verified: boolean): Promise<void>;
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

  async getRemoteIdentity(peerDeviceId: string): Promise<RemoteIdentity | null> {
    const row = await this.db.getFirst<RemoteIdentityRow>(
      `SELECT * FROM remote_identities WHERE peer_device_id = ?`,
      [peerDeviceId],
    );
    if (!row) return null;
    return {
      peerUserId: row.peer_user_id,
      peerDeviceId: row.peer_device_id,
      identityKeyPublic: row.identity_key_public,
      safetyNumber: row.safety_number,
      verified: row.verified === 1,
      lastSeenKeyFingerprint: row.last_key_fingerprint,
    };
  }

  async saveRemoteIdentity(identity: RemoteIdentity): Promise<void> {
    await this.db.run(
      `INSERT OR REPLACE INTO remote_identities
       (peer_device_id, peer_user_id, identity_key_public, safety_number, verified,
        last_key_fingerprint, updated_at)
       VALUES (?,?,?,?,?,?,?)`,
      [
        identity.peerDeviceId,
        identity.peerUserId,
        identity.identityKeyPublic,
        identity.safetyNumber,
        identity.verified ? 1 : 0,
        identity.lastSeenKeyFingerprint,
        Date.now(),
      ],
    );
  }

  async setVerified(peerDeviceId: string, verified: boolean): Promise<void> {
    await this.db.run(
      `UPDATE remote_identities SET verified = ? WHERE peer_device_id = ?`,
      [verified ? 1 : 0, peerDeviceId],
    );
  }
}
