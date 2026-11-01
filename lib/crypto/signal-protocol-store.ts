import {
  Direction,
  type KeyPairType,
  type StorageType,
} from "@privacyresearch/libsignal-protocol-typescript";

import type { ICryptoKeyStore } from "@/lib/db/crypto-key-store";
import type { IIdentityStore } from "@/lib/db/identity-store";
import type { ISessionStore } from "@/lib/db/session-store";

import { bytesToArrayBuffer, arrayBufferToBytes } from "./buffer-utils";
import { bytesToBase64 } from "./encoding";

/** Strip SignalProtocolAddress device suffix ("name.1" → "name"). */
export function identityStoreKey(encodedAddress: string): string {
  const lastDot = encodedAddress.lastIndexOf(".");
  if (lastDot > 0 && /^\d+$/.test(encodedAddress.slice(lastDot + 1))) {
    return encodedAddress.slice(0, lastDot);
  }
  return encodedAddress;
}

/** SQLCipher-backed Signal Protocol store (single local device). */
export class SignalProtocolStore implements StorageType {
  constructor(
    private readonly identityStore: IIdentityStore,
    private readonly cryptoKeyStore: ICryptoKeyStore,
    private readonly sessionStore: ISessionStore,
  ) {}

  async getIdentityKeyPair(): Promise<KeyPairType | undefined> {
    const local = await this.identityStore.getLocalIdentity();
    const priv = await this.cryptoKeyStore.getIdentityPrivateKey();
    if (!local || !priv) return undefined;
    return {
      pubKey: bytesToArrayBuffer(local.identityKeyPublic),
      privKey: bytesToArrayBuffer(priv),
    };
  }

  async getLocalRegistrationId(): Promise<number | undefined> {
    const local = await this.identityStore.getLocalIdentity();
    return local?.registrationId;
  }

  async isTrustedIdentity(
    identifier: string,
    identityKey: ArrayBuffer,
    direction: Direction,
  ): Promise<boolean> {
    const key = identityStoreKey(identifier);
    const existing = await this.identityStore.getRemoteIdentity(key);
    if (!existing) return true;
    if (this.buffersEqual(existing.identityKeyPublic, identityKey)) {
      // Same key: allow. Sending still blocked separately when keyChanged.
      return true;
    }
    // Different key presented: allow receive so UI can surface the change;
    // block sending until the user accepts the new identity.
    if (direction === Direction.SENDING) return false;
    return true;
  }

  async saveIdentity(
    encodedAddress: string,
    publicKey: ArrayBuffer,
    _nonblockingApproval?: boolean,
  ): Promise<boolean> {
    const key = identityStoreKey(encodedAddress);
    const newKey = arrayBufferToBytes(publicKey);
    const fingerprint = bytesToBase64(newKey);
    const existing = await this.identityStore.getRemoteIdentity(key);

    if (!existing) {
      await this.identityStore.saveRemoteIdentity({
        peerUserId: key,
        peerDeviceId: key,
        identityKeyPublic: newKey,
        safetyNumber: "",
        verified: false,
        keyChanged: false,
        lastSeenKeyFingerprint: fingerprint,
      });
      return false;
    }

    if (this.buffersEqual(existing.identityKeyPublic, publicKey)) {
      return false;
    }

    await this.sessionStore.delete(encodedAddress);
    // Also clear bare key session if present.
    await this.sessionStore.delete(key);
    await this.identityStore.saveRemoteIdentity({
      ...existing,
      peerUserId: key,
      peerDeviceId: key,
      identityKeyPublic: newKey,
      safetyNumber: "",
      verified: false,
      keyChanged: true,
      lastSeenKeyFingerprint: fingerprint,
    });
    return true;
  }

  async loadPreKey(keyId: number | string): Promise<KeyPairType | undefined> {
    const id = typeof keyId === "string" ? parseInt(keyId, 10) : keyId;
    const key = await this.cryptoKeyStore.getOneTimePreKey(id);
    if (!key) return undefined;
    return {
      pubKey: bytesToArrayBuffer(key.publicKey),
      privKey: bytesToArrayBuffer(key.privateKey),
    };
  }

  async storePreKey(
    keyId: number | string,
    keyPair: KeyPairType,
  ): Promise<void> {
    const id = typeof keyId === "string" ? parseInt(keyId, 10) : keyId;
    await this.cryptoKeyStore.saveOneTimePreKeys([
      {
        keyId: id,
        publicKey: arrayBufferToBytes(keyPair.pubKey),
        privateKey: arrayBufferToBytes(keyPair.privKey),
      },
    ]);
  }

  async removePreKey(keyId: number | string): Promise<void> {
    const id = typeof keyId === "string" ? parseInt(keyId, 10) : keyId;
    if (!Number.isFinite(id)) return;
    await this.cryptoKeyStore.removeOneTimePreKey(id);
  }

  async storeSession(
    encodedAddress: string,
    record: string,
  ): Promise<void> {
    const bytes = new TextEncoder().encode(record);
    await this.sessionStore.save(encodedAddress, {
      peerDeviceId: encodedAddress,
      serialized: bytes,
    });
  }

  async loadSession(encodedAddress: string): Promise<string | undefined> {
    const rec = await this.sessionStore.get(encodedAddress);
    if (!rec) return undefined;
    return new TextDecoder().decode(rec.serialized);
  }

  async loadSignedPreKey(
    keyId: number | string,
  ): Promise<KeyPairType | undefined> {
    const id = typeof keyId === "string" ? parseInt(keyId, 10) : keyId;
    const key = await this.cryptoKeyStore.getSignedPreKey(id);
    if (!key) return undefined;
    return {
      pubKey: bytesToArrayBuffer(key.publicKey),
      privKey: bytesToArrayBuffer(key.privateKey),
    };
  }

  async storeSignedPreKey(
    keyId: number | string,
    keyPair: KeyPairType,
  ): Promise<void> {
    const id = typeof keyId === "string" ? parseInt(keyId, 10) : keyId;
    await this.cryptoKeyStore.saveSignedPreKey({
      keyId: id,
      publicKey: arrayBufferToBytes(keyPair.pubKey),
      privateKey: arrayBufferToBytes(keyPair.privKey),
      signature: new Uint8Array(0),
    });
  }

  async removeSignedPreKey(keyId: number | string): Promise<void> {
    void keyId;
  }

  private buffersEqual(a: Uint8Array, b: ArrayBuffer): boolean {
    const bb = new Uint8Array(b);
    if (a.length !== bb.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== bb[i]) return false;
    }
    return true;
  }
}
