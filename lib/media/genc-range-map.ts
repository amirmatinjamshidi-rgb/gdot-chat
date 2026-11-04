/**
 * Pure helpers for mapping plaintext byte ranges → .genc AEAD chunks.
 * Mirrors media-aead / media-at-rest fixed-slot layout (and packed index math).
 */
import {
  expectedCiphertextLength,
  plainChunkLength,
} from "@/lib/crypto/media-aead";
import { MEDIA_AT_REST_MAGIC } from "@/lib/media/media-at-rest";

export type GencFormat = "fixed-slot" | "packed" | "local-wrap";

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

/** Inclusive chunk index range covering plaintext bytes [start, start+length). */
export function chunkRangeForPlainBytes(params: {
  start: number;
  length: number;
  chunkSize: number;
  chunkCount: number;
  plainSize: number;
}): { first: number; last: number } | null {
  const { start, length, chunkSize, chunkCount, plainSize } = params;
  if (start < 0 || length < 0) throw new Error("invalid range");
  if (length === 0 || start >= plainSize) return null;
  const end = Math.min(start + length, plainSize);
  const first = Math.floor(start / chunkSize);
  const last = Math.floor((end - 1) / chunkSize);
  if (first < 0 || last >= chunkCount) throw new Error("range out of chunks");
  return { first, last };
}

/** Build packed-format absolute offsets/lengths by scanning length prefixes. */
export function buildPackedIndex(
  packed: Uint8Array,
  expectedCount: number,
): { offsets: number[]; lengths: number[] } {
  const view = new DataView(packed.buffer, packed.byteOffset, packed.byteLength);
  const count = view.getUint32(0);
  if (count !== expectedCount) {
    throw new Error("packed chunk count mismatch");
  }
  const offsets: number[] = [];
  const lengths: number[] = [];
  let o = 4;
  for (let i = 0; i < count; i++) {
    const len = view.getUint32(o);
    o += 4;
    offsets.push(o);
    lengths.push(len);
    o += len;
  }
  return { offsets, lengths };
}

/**
 * Detect on-disk .genc layout from leading bytes.
 * - GDOTGENC magic → legacy whole-file wrap (not streamable via chunk DataSource)
 * - u32be count == chunkCount and sizes consistent → packed
 * - else → fixed-slot
 */
export function detectGencFormat(
  fileBytes: Uint8Array,
  chunkCount: number,
  plainSize: number,
  chunkSize: number,
): GencFormat {
  const magic = new TextEncoder().encode(MEDIA_AT_REST_MAGIC);
  if (
    fileBytes.byteLength >= magic.length &&
    magic.every((b, i) => fileBytes[i] === b)
  ) {
    return "local-wrap";
  }
  if (fileBytes.byteLength >= 4) {
    const view = new DataView(
      fileBytes.buffer,
      fileBytes.byteOffset,
      fileBytes.byteLength,
    );
    const count = view.getUint32(0);
    if (count === chunkCount) {
      try {
        buildPackedIndex(fileBytes, chunkCount);
        return "packed";
      } catch {
        /* fall through */
      }
    }
  }
  // Sanity: fixed-slot total size
  let expected = 0;
  for (let i = 0; i < chunkCount; i++) {
    expected += cipherChunkByteLength(plainSize, chunkSize, chunkCount, i);
  }
  if (fileBytes.byteLength === expected) return "fixed-slot";
  // Prefer packed attempt already failed; default fixed-slot for partial downloads.
  return "fixed-slot";
}
