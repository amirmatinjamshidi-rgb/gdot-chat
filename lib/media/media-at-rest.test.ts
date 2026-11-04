import { describe, expect, it } from "vitest";

import {
  generateMediaKey,
  generateNoncePrefix,
} from "@/lib/crypto/media-aead";
import {
  decryptFixedSlotCipherToPlaintext,
  decryptPackedCipherToPlaintext,
  encryptPlaintextToPackedCipher,
  unwrapLocalFileV1,
  wrapLocalFileV1,
  cipherFileSize,
  cipherChunkOffset,
} from "@/lib/media/media-at-rest";
import { packCipherChunks } from "@/lib/media/media-pack";
import { encryptChunk, plainChunkLength } from "@/lib/crypto/media-aead";

describe("media at-rest helpers", () => {
  it("packed cipher roundtrip is byte-exact", () => {
    const plain = new Uint8Array(40).map((_, i) => (i * 9) & 0xff);
    const key = generateMediaKey();
    const noncePrefix = generateNoncePrefix();
    const attachmentId = crypto.randomUUID();
    const chunkSize = 16;
    const chunkCount = Math.ceil(plain.length / chunkSize);
    const packed = encryptPlaintextToPackedCipher({
      key,
      noncePrefix,
      attachmentId,
      plainSize: plain.length,
      chunkSize,
      chunkCount,
      plaintext: plain,
    });
    const out = decryptPackedCipherToPlaintext({
      key,
      noncePrefix,
      attachmentId,
      plainSize: plain.length,
      chunkCount,
      packed,
    });
    expect([...out]).toEqual([...plain]);
  });

  it("fixed-slot file roundtrip matches packed", () => {
    const plain = new Uint8Array(24).map((_, i) => i + 2);
    const key = generateMediaKey();
    const noncePrefix = generateNoncePrefix();
    const attachmentId = crypto.randomUUID();
    const chunkSize = 8;
    const chunkCount = Math.ceil(plain.length / chunkSize);
    const file = new Uint8Array(cipherFileSize(plain.length, chunkSize, chunkCount));
    const packedChunks: Uint8Array[] = [];
    for (let i = 0; i < chunkCount; i++) {
      const len = plainChunkLength(plain.length, chunkSize, i, chunkCount);
      const slice = plain.subarray(i * chunkSize, i * chunkSize + len);
      const ct = encryptChunk({
        key,
        noncePrefix,
        attachmentId,
        chunkIndex: i,
        chunkCount,
        plaintextSize: plain.length,
        plaintext: slice,
      });
      packedChunks.push(ct);
      file.set(ct, cipherChunkOffset(plain.length, chunkSize, chunkCount, i));
    }
    const fromSlots = decryptFixedSlotCipherToPlaintext({
      key,
      noncePrefix,
      attachmentId,
      plainSize: plain.length,
      chunkSize,
      chunkCount,
      fileBytes: file,
    });
    expect([...fromSlots]).toEqual([...plain]);
    const fromPacked = decryptPackedCipherToPlaintext({
      key,
      noncePrefix,
      attachmentId,
      plainSize: plain.length,
      chunkCount,
      packed: packCipherChunks(packedChunks),
    });
    expect([...fromPacked]).toEqual([...plain]);
  });

  it("wrapLocalFileV1 authenticates with mediaKey", () => {
    const key = generateMediaKey();
    const attachmentId = crypto.randomUUID();
    const plain = new Uint8Array([1, 2, 3, 4, 5]);
    const wrapped = wrapLocalFileV1({ key, attachmentId, plaintext: plain });
    const out = unwrapLocalFileV1({ key, attachmentId, wrapped });
    expect([...out]).toEqual([...plain]);
    expect(() =>
      unwrapLocalFileV1({
        key,
        attachmentId: "other",
        wrapped,
      }),
    ).toThrow();
  });
});
