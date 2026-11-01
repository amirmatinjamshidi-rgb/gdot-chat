import { gcm } from "@noble/ciphers/aes.js";

import {
  MEDIA_ALGORITHM,
  MEDIA_GCM_TAG_BYTES,
  MEDIA_KEY_BYTES,
  MEDIA_NONCE_PREFIX_BYTES,
} from "@/lib/protocol/payload";

const AAD_LABEL = new TextEncoder().encode("gdot-media-v1");
const AAD_SEP = 0x1f;

export const MEDIA_CRYPTO = {
  algorithm: MEDIA_ALGORITHM,
  keyBytes: MEDIA_KEY_BYTES,
  noncePrefixBytes: MEDIA_NONCE_PREFIX_BYTES,
  nonceBytes: 12,
  tagBytes: MEDIA_GCM_TAG_BYTES,
} as const;

export class MediaAeadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MediaAeadError";
  }
}

export function generateMediaKey(): Uint8Array {
  return getSecureRandomBytes(MEDIA_KEY_BYTES);
}

export function generateNoncePrefix(): Uint8Array {
  return getSecureRandomBytes(MEDIA_NONCE_PREFIX_BYTES);
}

/** 12-byte GCM nonce: 8-byte prefix || uint32be(chunkIndex). */
export function chunkNonce(noncePrefix: Uint8Array, chunkIndex: number): Uint8Array {
  if (noncePrefix.length !== MEDIA_NONCE_PREFIX_BYTES) {
    throw new MediaAeadError("noncePrefix must be 8 bytes");
  }
  if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex > 0xffffffff) {
    throw new MediaAeadError("chunkIndex out of range");
  }
  const nonce = new Uint8Array(12);
  nonce.set(noncePrefix, 0);
  writeUint32Be(nonce, 8, chunkIndex);
  return nonce;
}

/**
 * Canonical AAD for a media chunk:
 * UTF-8("gdot-media-v1") || 0x1F || UTF-8(attachmentId) || 0x1F
 * || uint32be(chunkIndex) || uint32be(chunkCount) || uint64be(plaintextSize)
 */
export function buildChunkAad(params: {
  attachmentId: string;
  chunkIndex: number;
  chunkCount: number;
  plaintextSize: number;
}): Uint8Array {
  const idBytes = new TextEncoder().encode(params.attachmentId);
  const aad = new Uint8Array(AAD_LABEL.length + 1 + idBytes.length + 1 + 4 + 4 + 8);
  let o = 0;
  aad.set(AAD_LABEL, o);
  o += AAD_LABEL.length;
  aad[o++] = AAD_SEP;
  aad.set(idBytes, o);
  o += idBytes.length;
  aad[o++] = AAD_SEP;
  writeUint32Be(aad, o, params.chunkIndex);
  o += 4;
  writeUint32Be(aad, o, params.chunkCount);
  o += 4;
  writeUint64Be(aad, o, params.plaintextSize);
  return aad;
}

export function encryptChunk(params: {
  key: Uint8Array;
  noncePrefix: Uint8Array;
  attachmentId: string;
  chunkIndex: number;
  chunkCount: number;
  plaintextSize: number;
  plaintext: Uint8Array;
}): Uint8Array {
  assertKey(params.key);
  const nonce = chunkNonce(params.noncePrefix, params.chunkIndex);
  const aad = buildChunkAad(params);
  const cipher = gcm(params.key, nonce, aad);
  return cipher.encrypt(params.plaintext);
}

export function decryptChunk(params: {
  key: Uint8Array;
  noncePrefix: Uint8Array;
  attachmentId: string;
  chunkIndex: number;
  chunkCount: number;
  plaintextSize: number;
  ciphertext: Uint8Array;
}): Uint8Array {
  assertKey(params.key);
  if (params.ciphertext.length < MEDIA_GCM_TAG_BYTES) {
    throw new MediaAeadError("ciphertext too short");
  }
  const nonce = chunkNonce(params.noncePrefix, params.chunkIndex);
  const aad = buildChunkAad(params);
  const cipher = gcm(params.key, nonce, aad);
  try {
    return cipher.decrypt(params.ciphertext);
  } catch {
    throw new MediaAeadError("authentication failed");
  }
}

export function expectedCiphertextLength(plainChunkBytes: number): number {
  return plainChunkBytes + MEDIA_GCM_TAG_BYTES;
}

export function plainChunkLength(
  plaintextSize: number,
  chunkSize: number,
  chunkIndex: number,
  chunkCount: number,
): number {
  if (chunkIndex < 0 || chunkIndex >= chunkCount) {
    throw new MediaAeadError("chunkIndex out of range");
  }
  if (chunkIndex < chunkCount - 1) return chunkSize;
  return plaintextSize - chunkSize * (chunkCount - 1);
}

function assertKey(key: Uint8Array): void {
  if (key.length !== MEDIA_KEY_BYTES) {
    throw new MediaAeadError("media key must be 32 bytes");
  }
}

function writeUint32Be(buf: Uint8Array, offset: number, value: number): void {
  buf[offset] = (value >>> 24) & 0xff;
  buf[offset + 1] = (value >>> 16) & 0xff;
  buf[offset + 2] = (value >>> 8) & 0xff;
  buf[offset + 3] = value & 0xff;
}

function writeUint64Be(buf: Uint8Array, offset: number, value: number): void {
  const hi = Math.floor(value / 0x100000000);
  const lo = value >>> 0;
  writeUint32Be(buf, offset, hi);
  writeUint32Be(buf, offset + 4, lo);
}

function getSecureRandomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(out);
    return out;
  }
  throw new MediaAeadError("Secure random source is unavailable");
}
