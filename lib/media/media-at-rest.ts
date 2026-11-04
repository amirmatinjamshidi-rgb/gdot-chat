/**
 * Local media at-rest: durable files under gdot-media store packed *wire*
 * ciphertext (same chunks as MinIO). The per-attachment mediaKey lives only
 * inside SQLCipher (opened via KEK), so files are opaque while the app is locked.
 *
 * Playback materializes plaintext into an ephemeral cache directory that is
 * wiped on lock — never leave decrypted bytes in Documents.
 */
import { gcm } from "@noble/ciphers/aes.js";

import {
  decryptChunk,
  encryptChunk,
  expectedCiphertextLength,
  plainChunkLength,
} from "@/lib/crypto/media-aead";
import { MEDIA_GCM_TAG_BYTES, MEDIA_KEY_BYTES } from "@/lib/protocol/payload";
import {
  packCipherChunks,
  unpackCipherChunks,
} from "@/lib/media/media-pack";

export const MEDIA_AT_REST_EXT = "genc";
export const MEDIA_AT_REST_MAGIC = "GDOTGENC";

const LOCAL_AAD_LABEL = new TextEncoder().encode("gdot-local-file-v1");

export function isAtRestUri(uri: string | undefined | null): boolean {
  if (!uri) return false;
  return (
    uri.endsWith(`.${MEDIA_AT_REST_EXT}`) ||
    uri.includes(`.${MEDIA_AT_REST_EXT}?`) ||
    uri.includes(`/${MEDIA_AT_REST_EXT}/`)
  );
}

export function cipherFileSize(plainSize: number, chunkSize: number, chunkCount: number): number {
  let total = 0;
  for (let i = 0; i < chunkCount; i++) {
    total += expectedCiphertextLength(
      plainChunkLength(plainSize, chunkSize, i, chunkCount),
    );
  }
  return total;
}

/** Deterministic offset of cipher chunk i inside a packed-by-fixed-slots file. */
export function cipherChunkOffset(
  plainSize: number,
  chunkSize: number,
  chunkCount: number,
  chunkIndex: number,
): number {
  let o = 0;
  for (let i = 0; i < chunkIndex; i++) {
    o += expectedCiphertextLength(
      plainChunkLength(plainSize, chunkSize, i, chunkCount),
    );
  }
  return o;
}

export function cipherChunkByteLength(
  plainSize: number,
  chunkSize: number,
  chunkCount: number,
  chunkIndex: number,
): number {
  return expectedCiphertextLength(
    plainChunkLength(plainSize, chunkSize, chunkIndex, chunkCount),
  );
}

/** Encrypt full plaintext into packed wire-ciphertext for durable local storage. */
export function encryptPlaintextToPackedCipher(params: {
  key: Uint8Array;
  noncePrefix: Uint8Array;
  attachmentId: string;
  plainSize: number;
  chunkSize: number;
  chunkCount: number;
  plaintext: Uint8Array;
}): Uint8Array {
  assertKey(params.key);
  if (params.plaintext.byteLength !== params.plainSize) {
    throw new Error("plaintext length mismatch");
  }
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < params.chunkCount; i++) {
    const len = plainChunkLength(
      params.plainSize,
      params.chunkSize,
      i,
      params.chunkCount,
    );
    const start = i * params.chunkSize;
    const slice = params.plaintext.subarray(start, start + len);
    chunks.push(
      encryptChunk({
        key: params.key,
        noncePrefix: params.noncePrefix,
        attachmentId: params.attachmentId,
        chunkIndex: i,
        chunkCount: params.chunkCount,
        plaintextSize: params.plainSize,
        plaintext: slice,
      }),
    );
  }
  return packCipherChunks(chunks);
}

/** Decrypt packed wire-ciphertext back to plaintext (for playback / migration). */
export function decryptPackedCipherToPlaintext(params: {
  key: Uint8Array;
  noncePrefix: Uint8Array;
  attachmentId: string;
  plainSize: number;
  chunkCount: number;
  packed: Uint8Array;
}): Uint8Array {
  assertKey(params.key);
  const chunks = unpackCipherChunks(params.packed, params.chunkCount);
  const out = new Uint8Array(params.plainSize);
  let o = 0;
  for (let i = 0; i < params.chunkCount; i++) {
    const plain = decryptChunk({
      key: params.key,
      noncePrefix: params.noncePrefix,
      attachmentId: params.attachmentId,
      chunkIndex: i,
      chunkCount: params.chunkCount,
      plaintextSize: params.plainSize,
      ciphertext: chunks[i]!,
    });
    out.set(plain, o);
    o += plain.byteLength;
  }
  if (o !== params.plainSize) {
    throw new Error("decrypted size mismatch");
  }
  return out;
}


/** Decrypt a fixed-slot at-rest file (cipher chunks at deterministic offsets). */
export function decryptFixedSlotCipherToPlaintext(params: {
  key: Uint8Array;
  noncePrefix: Uint8Array;
  attachmentId: string;
  plainSize: number;
  chunkSize: number;
  chunkCount: number;
  fileBytes: Uint8Array;
}): Uint8Array {
  assertKey(params.key);
  const out = new Uint8Array(params.plainSize);
  for (let i = 0; i < params.chunkCount; i++) {
    const off = cipherChunkOffset(
      params.plainSize,
      params.chunkSize,
      params.chunkCount,
      i,
    );
    const len = cipherChunkByteLength(
      params.plainSize,
      params.chunkSize,
      params.chunkCount,
      i,
    );
    const ciphertext = params.fileBytes.subarray(off, off + len);
    const plain = decryptChunk({
      key: params.key,
      noncePrefix: params.noncePrefix,
      attachmentId: params.attachmentId,
      chunkIndex: i,
      chunkCount: params.chunkCount,
      plaintextSize: params.plainSize,
      ciphertext,
    });
    out.set(plain, i * params.chunkSize);
  }
  return out;
}

/** MAGIC || nonce12 || uint64be(plainLen) || ciphertext+tag */
export function wrapLocalFileV1(params: {
  key: Uint8Array;
  attachmentId: string;
  plaintext: Uint8Array;
}): Uint8Array {
  assertKey(params.key);
  const nonce = getSecureRandomBytes(12);
  const aad = buildLocalAad(params.attachmentId, params.plaintext.byteLength);
  const cipher = gcm(params.key, nonce, aad);
  const ct = cipher.encrypt(params.plaintext);
  const magic = new TextEncoder().encode(MEDIA_AT_REST_MAGIC);
  const out = new Uint8Array(magic.length + 12 + 8 + ct.length);
  out.set(magic, 0);
  out.set(nonce, magic.length);
  writeUint64Be(out, magic.length + 12, params.plaintext.byteLength);
  out.set(ct, magic.length + 12 + 8);
  return out;
}

export function unwrapLocalFileV1(params: {
  key: Uint8Array;
  attachmentId: string;
  wrapped: Uint8Array;
}): Uint8Array {
  assertKey(params.key);
  const magic = new TextEncoder().encode(MEDIA_AT_REST_MAGIC);
  if (params.wrapped.byteLength < magic.length + 12 + 8 + MEDIA_GCM_TAG_BYTES) {
    throw new Error("at-rest blob too short");
  }
  for (let i = 0; i < magic.length; i++) {
    if (params.wrapped[i] !== magic[i]) throw new Error("at-rest magic mismatch");
  }
  const nonce = params.wrapped.subarray(magic.length, magic.length + 12);
  const plainLen = readUint64Be(params.wrapped, magic.length + 12);
  const ct = params.wrapped.subarray(magic.length + 12 + 8);
  const aad = buildLocalAad(params.attachmentId, plainLen);
  const cipher = gcm(params.key, nonce, aad);
  try {
    const plain = cipher.decrypt(ct);
    if (plain.byteLength !== plainLen) throw new Error("size mismatch");
    return plain;
  } catch {
    throw new Error("at-rest authentication failed");
  }
}

function buildLocalAad(attachmentId: string, plainLen: number): Uint8Array {
  const idBytes = new TextEncoder().encode(attachmentId);
  const aad = new Uint8Array(LOCAL_AAD_LABEL.length + 1 + idBytes.length + 1 + 8);
  let o = 0;
  aad.set(LOCAL_AAD_LABEL, o);
  o += LOCAL_AAD_LABEL.length;
  aad[o++] = 0x1f;
  aad.set(idBytes, o);
  o += idBytes.length;
  aad[o++] = 0x1f;
  writeUint64Be(aad, o, plainLen);
  return aad;
}

function assertKey(key: Uint8Array): void {
  if (key.length !== MEDIA_KEY_BYTES) {
    throw new Error("media key must be 32 bytes");
  }
}

function writeUint64Be(buf: Uint8Array, offset: number, value: number): void {
  const hi = Math.floor(value / 0x100000000);
  const lo = value >>> 0;
  buf[offset] = (hi >>> 24) & 0xff;
  buf[offset + 1] = (hi >>> 16) & 0xff;
  buf[offset + 2] = (hi >>> 8) & 0xff;
  buf[offset + 3] = hi & 0xff;
  buf[offset + 4] = (lo >>> 24) & 0xff;
  buf[offset + 5] = (lo >>> 16) & 0xff;
  buf[offset + 6] = (lo >>> 8) & 0xff;
  buf[offset + 7] = lo & 0xff;
}

function readUint64Be(buf: Uint8Array, offset: number): number {
  const hi =
    ((buf[offset]! << 24) |
      (buf[offset + 1]! << 16) |
      (buf[offset + 2]! << 8) |
      buf[offset + 3]!) >>>
    0;
  const lo =
    ((buf[offset + 4]! << 24) |
      (buf[offset + 5]! << 16) |
      (buf[offset + 6]! << 8) |
      buf[offset + 7]!) >>>
    0;
  return hi * 0x100000000 + lo;
}

function getSecureRandomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(out);
    return out;
  }
  throw new Error("Secure random source is unavailable");
}
