import {
  Direction,
  type KeyPairType,
  type StorageType,
} from "@privacyresearch/libsignal-protocol-typescript";

import type { ICryptoKeyStore } from "@/lib/db/crypto-key-store";
import type { IIdentityStore } from "@/lib/db/identity-store";
import type { ISessionStore } from "@/lib/db/session-store";

import { bytesToArrayBuffer, arrayBufferToBytes } from "./buffer-utils";

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
    _identifier: string,
    _identityKey: ArrayBuffer,
    _direction: Direction,
  ): Promise<boolean> {
    return true;
  }

  async saveIdentity(
    encodedAddress: string,
    publicKey: ArrayBuffer,
    _nonblockingApproval?: boolean,
  ): Promise<boolean> {
    const existing = await this.identityStore.getRemoteIdentity(encodedAddress);
    if (
      existing &&
      !this.buffersEqual(existing.identityKeyPublic, publicKey)
    ) {
      return true;
    }
    return false;
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
    void keyId;
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
