/**
 * Stub libsignal native module — replace Swift/Kotlin bindings in Phase 2.
 * Uses in-process placeholder crypto for development until prebuild + native ship.
 */

import { getRandomBytes } from "expo-crypto";

function randomBytes(length: number): Uint8Array {
  return getRandomBytes(length);
}

export interface SignedPreKeyResult {
  keyId: number;
  publicKey: string;
  privateKey: string;
  signature: string;
}

export interface PreKeyResult {
  keyId: number;
  publicKey: string;
  privateKey: string;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const LibSignalModule = {
  async generateIdentityKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
    const bytes = randomBytes(33);
    bytes[0] = 5;
    const priv = randomBytes(32);
    return { publicKey: toB64(bytes), privateKey: toB64(priv) };
  },

  async generateRegistrationId(): Promise<number> {
    const buf = randomBytes(4);
    return (
      ((buf[0]! << 24) | (buf[1]! << 16) | (buf[2]! << 8) | buf[3]!) &
      0x3fff
    );
  },

  async generateSignedPreKey(
    _identityPrivate: string,
    keyId: number,
  ): Promise<SignedPreKeyResult> {
    return {
      keyId,
      publicKey: toB64(randomBytes(32)),
      privateKey: toB64(randomBytes(32)),
      signature: toB64(randomBytes(64)),
    };
  },

  async generatePreKeys(startId: number, count: number): Promise<PreKeyResult[]> {
    return Array.from({ length: count }, (_, i) => ({
      keyId: startId + i,
      publicKey: toB64(randomBytes(32)),
      privateKey: toB64(randomBytes(32)),
    }));
  },

  async processPreKeyBundle(
    _localIdentityPrivate: string,
    _localRegistrationId: number,
    remoteBundleJson: string,
    existingSession?: string,
  ): Promise<{ session: string; identityChanged: boolean }> {
    const session = existingSession ?? toB64(textEncoder.encode(remoteBundleJson));
    return { session, identityChanged: false };
  },

  async encrypt(
    session: string,
    plaintext: string,
  ): Promise<{ ciphertext: string; messageType: number; session: string }> {
    const payload = toB64(textEncoder.encode(plaintext));
    return { ciphertext: payload, messageType: 3, session };
  },

  async decrypt(
    session: string,
    messageType: number,
    ciphertext: string,
  ): Promise<{ plaintext: string; session: string }> {
    void messageType;
    return {
      plaintext: textDecoder.decode(fromB64(ciphertext)),
      session,
    };
  },

  async computeSafetyNumber(
    localIdentityPublic: string,
    remoteIdentityPublic: string,
  ): Promise<string> {
    const combined = localIdentityPublic + remoteIdentityPublic;
    let hash = 0;
    for (let i = 0; i < combined.length; i++) {
      hash = (hash * 31 + combined.charCodeAt(i)) >>> 0;
    }
    return String(hash).padStart(12, "0").repeat(5).slice(0, 60);
  },
};
