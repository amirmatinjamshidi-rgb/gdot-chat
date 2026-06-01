import { LibSignalModule } from "@/modules/libsignal/src";

import type {
  CiphertextResult,
  IdentityKeyPair,
  PreKey,
  SessionRecord,
  SignedPreKey,
} from "./types";
import { base64ToBytes, bytesToBase64, textToBytes } from "./encoding";

export interface ICryptoEngine {
  generateIdentityKeyPair(): Promise<IdentityKeyPair>;
  generateRegistrationId(): Promise<number>;
  generateSignedPreKey(
    identity: IdentityKeyPair,
    keyId: number,
  ): Promise<SignedPreKey>;
  generatePreKeys(startId: number, count: number): Promise<PreKey[]>;
  encrypt(sessionRecord: SessionRecord, plaintext: string): Promise<CiphertextResult>;
  decrypt(
    sessionRecord: SessionRecord,
    ciphertext: Uint8Array,
    type: 2 | 3,
  ): Promise<string>;
  serializeSession(record: SessionRecord): Promise<Uint8Array>;
  deserializeSession(bytes: Uint8Array, peerDeviceId: string): Promise<SessionRecord>;
  computeSafetyNumber(localPublic: Uint8Array, remotePublic: Uint8Array): Promise<string>;
}

export class LibSignalAdapter implements ICryptoEngine {
  async generateIdentityKeyPair(): Promise<IdentityKeyPair> {
    const pair = await LibSignalModule.generateIdentityKeyPair();
    return {
      publicKey: base64ToBytes(pair.publicKey),
      privateKey: base64ToBytes(pair.privateKey),
    };
  }

  async generateRegistrationId(): Promise<number> {
    return LibSignalModule.generateRegistrationId();
  }

  async generateSignedPreKey(
    identity: IdentityKeyPair,
    keyId: number,
  ): Promise<SignedPreKey> {
    const spk = await LibSignalModule.generateSignedPreKey(
      bytesToBase64(identity.privateKey),
      keyId,
    );
    return {
      keyId: spk.keyId,
      publicKey: base64ToBytes(spk.publicKey),
      privateKey: base64ToBytes(spk.privateKey),
      signature: base64ToBytes(spk.signature),
    };
  }

  async generatePreKeys(startId: number, count: number): Promise<PreKey[]> {
    const keys = await LibSignalModule.generatePreKeys(startId, count);
    return keys.map((k) => ({
      keyId: k.keyId,
      publicKey: base64ToBytes(k.publicKey),
      privateKey: base64ToBytes(k.privateKey),
    }));
  }

  async encrypt(
    sessionRecord: SessionRecord,
    plaintext: string,
  ): Promise<CiphertextResult> {
    const sessionB64 = bytesToBase64(sessionRecord.serialized);
    const result = await LibSignalModule.encrypt(sessionB64, plaintext);
    return {
      ciphertext: base64ToBytes(result.ciphertext),
      messageType: result.messageType as 2 | 3,
      updatedSession: base64ToBytes(result.session),
    };
  }

  async decrypt(
    sessionRecord: SessionRecord,
    ciphertext: Uint8Array,
    type: 2 | 3,
  ): Promise<string> {
    const result = await LibSignalModule.decrypt(
      bytesToBase64(sessionRecord.serialized),
      type,
      bytesToBase64(ciphertext),
    );
    return result.plaintext;
  }

  async serializeSession(record: SessionRecord): Promise<Uint8Array> {
    return record.serialized;
  }

  async deserializeSession(
    bytes: Uint8Array,
    peerDeviceId: string,
  ): Promise<SessionRecord> {
    return { peerDeviceId, serialized: bytes };
  }

  async computeSafetyNumber(
    localPublic: Uint8Array,
    remotePublic: Uint8Array,
  ): Promise<string> {
    return LibSignalModule.computeSafetyNumber(
      bytesToBase64(localPublic),
      bytesToBase64(remotePublic),
    );
  }

  async processPreKeyBundle(
    identityPrivate: Uint8Array,
    registrationId: number,
    remoteBundleJson: string,
    existingSession?: SessionRecord,
  ): Promise<{ session: SessionRecord; identityChanged: boolean }> {
    const result = await LibSignalModule.processPreKeyBundle(
      bytesToBase64(identityPrivate),
      registrationId,
      remoteBundleJson,
      existingSession
        ? bytesToBase64(existingSession.serialized)
        : undefined,
    );
    return {
      session: {
        peerDeviceId: "",
        serialized: base64ToBytes(result.session),
      },
      identityChanged: result.identityChanged,
    };
  }

  initialSession(peerDeviceId: string): SessionRecord {
    return {
      peerDeviceId,
      serialized: textToBytes(`session:${peerDeviceId}`),
    };
  }
}
