import type { PreKeyBundleDto } from "@/lib/api/api-types";
import type { ICryptoKeyStore } from "@/lib/db/crypto-key-store";
import type { IIdentityStore } from "@/lib/db/identity-store";
import type { ISessionStore } from "@/lib/db/session-store";

import type {
  CiphertextResult,
  IdentityKeyPair,
  PreKey,
  SessionRecord,
  SignedPreKey,
} from "./types";
import { SignalEngine } from "./signal-engine";
import { bytesToBase64 } from "./encoding";

export interface ICryptoEngine {
  generateIdentityKeyPair(): Promise<IdentityKeyPair>;
  generateRegistrationId(): Promise<number>;
  generateSignedPreKey(
    identity: IdentityKeyPair,
    keyId: number,
  ): Promise<SignedPreKey>;
  generatePreKeys(startId: number, count: number): Promise<PreKey[]>;
  encrypt(
    peerAddressId: string,
    plaintext: string,
  ): Promise<CiphertextResult>;
  decrypt(
    peerAddressId: string,
    ciphertext: Uint8Array,
    type: 2 | 3,
  ): Promise<string>;
  ensureSession(peerAddressId: string, bundle: PreKeyBundleDto): Promise<void>;
  computeSafetyNumber(
    localPublic: Uint8Array,
    remotePublic: Uint8Array,
  ): Promise<string>;
}

/** Real Signal Protocol via @privacyresearch/libsignal-protocol-typescript. */
export class LibSignalAdapter implements ICryptoEngine {
  private readonly engine: SignalEngine;

  constructor(
    identityStore: IIdentityStore,
    cryptoKeyStore: ICryptoKeyStore,
    sessionStore: ISessionStore,
  ) {
    this.engine = new SignalEngine(
      identityStore,
      cryptoKeyStore,
      sessionStore,
    );
  }

  generateIdentityKeyPair(): Promise<IdentityKeyPair> {
    return this.engine.generateIdentityKeyPair();
  }

  generateRegistrationId(): Promise<number> {
    return this.engine.generateRegistrationId();
  }

  generateSignedPreKey(
    identity: IdentityKeyPair,
    keyId: number,
  ): Promise<SignedPreKey> {
    return this.engine.generateSignedPreKey(identity, keyId);
  }

  generatePreKeys(startId: number, count: number): Promise<PreKey[]> {
    return this.engine.generatePreKeys(startId, count);
  }

  async ensureSession(
    peerAddressId: string,
    bundle: PreKeyBundleDto,
  ): Promise<void> {
    return this.engine.ensureSession(peerAddressId, bundle);
  }

  async encrypt(
    peerAddressId: string,
    plaintext: string,
  ): Promise<CiphertextResult> {
    const result = await this.engine.encrypt(peerAddressId, plaintext);
    return {
      ciphertext: result.ciphertext,
      messageType: result.messageType,
      updatedSession: new Uint8Array(0),
    };
  }

  async decrypt(
    peerAddressId: string,
    ciphertext: Uint8Array,
    type: 2 | 3,
  ): Promise<string> {
    return this.engine.decrypt(peerAddressId, type, ciphertext);
  }

  computeSafetyNumber(
    localPublic: Uint8Array,
    remotePublic: Uint8Array,
  ): Promise<string> {
    return this.engine.computeSafetyNumber(localPublic, remotePublic);
  }

  /** @deprecated Session blobs managed by SignalProtocolStore */
  async serializeSession(record: SessionRecord): Promise<Uint8Array> {
    return record.serialized;
  }

  async deserializeSession(
    bytes: Uint8Array,
    peerDeviceId: string,
  ): Promise<SessionRecord> {
    return { peerDeviceId, serialized: bytes };
  }
}

export function ciphertextToBase64(ciphertext: Uint8Array): string {
  return bytesToBase64(ciphertext);
}
