import { describe, expect, it } from "vitest";

import {
  encryptChunk,
  generateMediaKey,
  generateNoncePrefix,
  plainChunkLength,
} from "@/lib/crypto/media-aead";
import {
  buildPackedIndex,
  chunkRangeForPlainBytes,
  cipherChunkByteLength,
  cipherChunkOffset,
  detectGencFormat,
} from "@/lib/media/genc-range-map";
import { packCipherChunks } from "@/lib/media/media-pack";
import { MEDIA_AT_REST_MAGIC } from "@/lib/media/media-at-rest";

describe("genc-range-map", () => {
  it("maps plaintext ranges onto chunk indices", () => {
    const plainSize = 10_000;
    const chunkSize = 3_000;
    const chunkCount = 4; // 3000+3000+3000+1000
    expect(
      chunkRangeForPlainBytes({
        start: 0,
        length: 100,
        chunkSize,
        chunkCount,
        plainSize,
      }),
    ).toEqual({ first: 0, last: 0 });
    expect(
      chunkRangeForPlainBytes({
        start: 2990,
        length: 20,
        chunkSize,
        chunkCount,
        plainSize,
      }),
    ).toEqual({ first: 0, last: 1 });
    expect(
      chunkRangeForPlainBytes({
        start: 9000,
        length: 500,
        chunkSize,
        chunkCount,
        plainSize,
      }),
    ).toEqual({ first: 3, last: 3 });
  });

  it("fixed-slot offsets match AEAD ciphertext lengths", () => {
    const plainSize = 5000;
    const chunkSize = 2048;
    const chunkCount = 3;
    let expected = 0;
    for (let i = 0; i < chunkCount; i++) {
      expect(cipherChunkOffset(plainSize, chunkSize, chunkCount, i)).toBe(
        expected,
      );
      const len = cipherChunkByteLength(plainSize, chunkSize, chunkCount, i);
      expect(len).toBe(plainChunkLength(plainSize, chunkSize, i, chunkCount) + 16);
      expected += len;
    }
  });

  it("detects packed vs fixed-slot vs local-wrap (format compat)", async () => {
    const key = generateMediaKey();
    const noncePrefix = generateNoncePrefix();
    const attachmentId = "att-range-1";
    const plainSize = 200;
    const chunkSize = 128;
    const chunkCount = 2;
    const plaintext = new Uint8Array(plainSize);
    plaintext.fill(7);
    const chunks: Uint8Array[] = [];
    for (let i = 0; i < chunkCount; i++) {
      const len = plainChunkLength(plainSize, chunkSize, i, chunkCount);
      chunks.push(
        encryptChunk({
          key,
          noncePrefix,
          attachmentId,
          chunkIndex: i,
          chunkCount,
          plaintextSize: plainSize,
          plaintext: plaintext.subarray(i * chunkSize, i * chunkSize + len),
        }),
      );
    }
    const packed = packCipherChunks(chunks);
    expect(detectGencFormat(packed, chunkCount, plainSize, chunkSize)).toBe(
      "packed",
    );
    const index = buildPackedIndex(packed, chunkCount);
    expect(index.offsets.length).toBe(chunkCount);
    expect(index.lengths[0]).toBe(chunks[0]!.byteLength);

    // fixed-slot: concatenate cipher chunks without length prefixes
    let total = 0;
    for (const c of chunks) total += c.byteLength;
    const fixed = new Uint8Array(total);
    let o = 0;
    for (const c of chunks) {
      fixed.set(c, o);
      o += c.byteLength;
    }
    expect(detectGencFormat(fixed, chunkCount, plainSize, chunkSize)).toBe(
      "fixed-slot",
    );

    const magic = new TextEncoder().encode(MEDIA_AT_REST_MAGIC);
    const wrap = new Uint8Array(magic.length + 40);
    wrap.set(magic, 0);
    expect(detectGencFormat(wrap, chunkCount, plainSize, chunkSize)).toBe(
      "local-wrap",
    );
  });
});
