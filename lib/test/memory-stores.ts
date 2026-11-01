import type { PreKey, SignedPreKey, SessionRecord } from "@/lib/crypto/types";
import type { ICryptoKeyStore } from "@/lib/db/crypto-key-store";
import type { IIdentityStore } from "@/lib/db/identity-store";
import type { ISessionStore } from "@/lib/db/session-store";
import type { LocalIdentity, RemoteIdentity } from "@/lib/db/types";

export class MemoryIdentityStore implements IIdentityStore {
  local: LocalIdentity | null = null;
  remotes = new Map<string, RemoteIdentity>();

  async getLocalIdentity(): Promise<LocalIdentity | null> {
    return this.local;
  }

  async saveLocalIdentity(identity: LocalIdentity): Promise<void> {
    this.local = { ...identity };
  }

  async getRemoteIdentity(peerAddressId: string): Promise<RemoteIdentity | null> {
    return this.remotes.get(peerAddressId) ?? null;
  }

  async saveRemoteIdentity(identity: RemoteIdentity): Promise<void> {
    this.remotes.set(identity.peerDeviceId, { ...identity });
  }

  async setVerified(peerAddressId: string, verified: boolean): Promise<void> {
    const r = this.remotes.get(peerAddressId);
    if (r) this.remotes.set(peerAddressId, { ...r, verified });
  }

  async setKeyChanged(peerAddressId: string, keyChanged: boolean): Promise<void> {
    const r = this.remotes.get(peerAddressId);
    if (r) this.remotes.set(peerAddressId, { ...r, keyChanged });
  }
}

export class MemorySessionStore implements ISessionStore {
  private map = new Map<string, SessionRecord>();

  async get(peerDeviceId: string): Promise<SessionRecord | null> {
    const v = this.map.get(peerDeviceId);
    return v ? { peerDeviceId: v.peerDeviceId, serialized: new Uint8Array(v.serialized) } : null;
  }

  async save(peerDeviceId: string, record: SessionRecord): Promise<void> {
    this.map.set(peerDeviceId, {
      peerDeviceId,
      serialized: new Uint8Array(record.serialized),
    });
  }

  async delete(peerDeviceId: string): Promise<void> {
    this.map.delete(peerDeviceId);
  }
}

export class MemoryCryptoKeyStore implements ICryptoKeyStore {
  identityPrivate: Uint8Array | null = null;
  signed = new Map<number, SignedPreKey>();
  oneTime = new Map<number, PreKey & { consumed?: boolean }>();
  nextOtk = 1;

  async getIdentityPrivateKey(): Promise<Uint8Array | null> {
    return this.identityPrivate ? new Uint8Array(this.identityPrivate) : null;
  }

  async saveIdentityPrivateKey(privateKey: Uint8Array): Promise<void> {
    this.identityPrivate = new Uint8Array(privateKey);
  }

  async getSignedPreKey(keyId: number): Promise<SignedPreKey | null> {
    const k = this.signed.get(keyId);
    return k
      ? {
          keyId: k.keyId,
          publicKey: new Uint8Array(k.publicKey),
          privateKey: new Uint8Array(k.privateKey),
          signature: new Uint8Array(k.signature),
        }
      : null;
  }

  async saveSignedPreKey(key: SignedPreKey): Promise<void> {
    this.signed.set(key.keyId, {
      keyId: key.keyId,
      publicKey: new Uint8Array(key.publicKey),
      privateKey: new Uint8Array(key.privateKey),
      signature: new Uint8Array(key.signature),
    });
  }

  async getOneTimePreKey(keyId: number): Promise<PreKey | null> {
    const k = this.oneTime.get(keyId);
    if (!k || k.consumed) return null;
    if (k.privateKey.length === 0) return null;
    return {
      keyId: k.keyId,
      publicKey: new Uint8Array(k.publicKey),
      privateKey: new Uint8Array(k.privateKey),
    };
  }

  async saveOneTimePreKeys(keys: PreKey[]): Promise<void> {
    for (const k of keys) {
      this.oneTime.set(k.keyId, {
        keyId: k.keyId,
        publicKey: new Uint8Array(k.publicKey),
        privateKey: new Uint8Array(k.privateKey),
        consumed: false,
      });
    }
  }

  async removeOneTimePreKey(keyId: number): Promise<void> {
    const k = this.oneTime.get(keyId);
    if (!k) return;
    this.oneTime.set(keyId, {
      ...k,
      privateKey: new Uint8Array(0),
      consumed: true,
    });
  }

  async getNextOtkKeyId(): Promise<number> {
    return this.nextOtk;
  }

  async setNextOtkKeyId(nextId: number): Promise<void> {
    this.nextOtk = nextId;
  }

  async getNextSignedPreKeyId(): Promise<number> {
    let max = 0;
    for (const id of this.signed.keys()) max = Math.max(max, id);
    return max + 1;
  }
}
