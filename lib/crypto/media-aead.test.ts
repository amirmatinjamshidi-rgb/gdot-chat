import { describe, expect, test } from "vitest";
import {
  buildChunkAad,
  chunkNonce,
  decryptChunk,
  encryptChunk,
  expectedCiphertextLength,
  generateMediaKey,
  generateNoncePrefix,
  MEDIA_CRYPTO,
  MediaAeadError,
  plainChunkLength,
} from "./media-aead";

function bytes(fill: number, length: number): Uint8Array {
  return new Uint8Array(length).fill(fill);
}

describe("A256GCM-CHUNKED-V1", () => {
  const attachmentId = "att-test-1";
  const key = generateMediaKey();
  const noncePrefix = generateNoncePrefix();

  test("key and nonce sizes", () => {
    expect(key.length).toBe(MEDIA_CRYPTO.keyBytes);
    expect(noncePrefix.length).toBe(MEDIA_CRYPTO.noncePrefixBytes);
    expect(generateMediaKey()).not.toEqual(generateMediaKey());
  });

  test("nonces are unique per chunk index", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 64; i++) {
      const n = chunkNonce(noncePrefix, i);
      expect(n.length).toBe(12);
      const hex = Buffer.from(n).toString("hex");
      expect(seen.has(hex)).toBe(false);
      seen.add(hex);
    }
  });

  test("empty chunk roundtrip", () => {
    const plaintext = new Uint8Array(0);
    const ciphertext = encryptChunk({
      key,
      noncePrefix,
      attachmentId,
      chunkIndex: 0,
      chunkCount: 1,
      plaintextSize: 0,
      plaintext,
    });
    expect(ciphertext.length).toBe(expectedCiphertextLength(0));
    const out = decryptChunk({
      key,
      noncePrefix,
      attachmentId,
      chunkIndex: 0,
      chunkCount: 1,
      plaintextSize: 0,
      ciphertext,
    });
    expect(out).toEqual(plaintext);
  });

  test("small / partial / full / multi-chunk roundtrip", () => {
    const chunkSize = 16;
    const cases = [1, 15, 16, 17, 48, 64];
    for (const size of cases) {
      const original = bytes(9, size);
      const chunkCount = Math.ceil(size / chunkSize);
      const recovered = new Uint8Array(size);
      for (let i = 0; i < chunkCount; i++) {
        const len = plainChunkLength(size, chunkSize, i, chunkCount);
        const start = i * chunkSize;
        const slice = original.subarray(start, start + len);
        const ciphertext = encryptChunk({
          key,
          noncePrefix,
          attachmentId,
          chunkIndex: i,
          chunkCount,
          plaintextSize: size,
          plaintext: slice,
        });
        expect(ciphertext.length).toBe(expectedCiphertextLength(len));
        const plain = decryptChunk({
          key,
          noncePrefix,
          attachmentId,
          chunkIndex: i,
          chunkCount,
          plaintextSize: size,
          ciphertext,
        });
        recovered.set(plain, start);
      }
      expect(recovered).toEqual(original);
    }
  });

  test("wrong key fails", () => {
    const plaintext = bytes(1, 32);
    const ciphertext = encryptChunk({
      key,
      noncePrefix,
      attachmentId,
      chunkIndex: 0,
      chunkCount: 1,
      plaintextSize: 32,
      plaintext,
    });
    expect(() =>
      decryptChunk({
        key: generateMediaKey(),
        noncePrefix,
        attachmentId,
        chunkIndex: 0,
        chunkCount: 1,
        plaintextSize: 32,
        ciphertext,
      }),
    ).toThrow(MediaAeadError);
  });

  test("modified ciphertext and tag fail", () => {
    const plaintext = bytes(2, 32);
    const ciphertext = encryptChunk({
      key,
      noncePrefix,
      attachmentId,
      chunkIndex: 0,
      chunkCount: 1,
      plaintextSize: 32,
      plaintext,
    });
    const flipCt = new Uint8Array(ciphertext);
    flipCt[0] ^= 0xff;
    expect(() =>
      decryptChunk({
        key,
        noncePrefix,
        attachmentId,
        chunkIndex: 0,
        chunkCount: 1,
        plaintextSize: 32,
        ciphertext: flipCt,
      }),
    ).toThrow(MediaAeadError);

    const flipTag = new Uint8Array(ciphertext);
    flipTag[flipTag.length - 1] ^= 0xff;
    expect(() =>
      decryptChunk({
        key,
        noncePrefix,
        attachmentId,
        chunkIndex: 0,
        chunkCount: 1,
        plaintextSize: 32,
        ciphertext: flipTag,
      }),
    ).toThrow(MediaAeadError);
  });

  test("modified chunk index / AAD fails", () => {
    const plaintext = bytes(3, 32);
    const ciphertext = encryptChunk({
      key,
      noncePrefix,
      attachmentId,
      chunkIndex: 0,
      chunkCount: 2,
      plaintextSize: 48,
      plaintext,
    });
    expect(() =>
      decryptChunk({
        key,
        noncePrefix,
        attachmentId,
        chunkIndex: 1,
        chunkCount: 2,
        plaintextSize: 48,
        ciphertext,
      }),
    ).toThrow(MediaAeadError);
    expect(() =>
      decryptChunk({
        key,
        noncePrefix,
        attachmentId: "other-id",
        chunkIndex: 0,
        chunkCount: 2,
        plaintextSize: 48,
        ciphertext,
      }),
    ).toThrow(MediaAeadError);
  });

  test("swapped chunks fail authentication", () => {
    const a = bytes(4, 16);
    const b = bytes(5, 16);
    const c0 = encryptChunk({
      key,
      noncePrefix,
      attachmentId,
      chunkIndex: 0,
      chunkCount: 2,
      plaintextSize: 32,
      plaintext: a,
    });
    const c1 = encryptChunk({
      key,
      noncePrefix,
      attachmentId,
      chunkIndex: 1,
      chunkCount: 2,
      plaintextSize: 32,
      plaintext: b,
    });
    expect(() =>
      decryptChunk({
        key,
        noncePrefix,
        attachmentId,
        chunkIndex: 0,
        chunkCount: 2,
        plaintextSize: 32,
        ciphertext: c1,
      }),
    ).toThrow(MediaAeadError);
    expect(c0).not.toEqual(c1);
  });

    test("large multi-chunk roundtrip", () => {
      const chunkSize = 1024;
      const size = 10_000;
      const original = bytes(11, size);
      const chunkCount = Math.ceil(size / chunkSize);
      const recovered = new Uint8Array(size);
      for (let i = 0; i < chunkCount; i++) {
        const len = plainChunkLength(size, chunkSize, i, chunkCount);
        const start = i * chunkSize;
        const ciphertext = encryptChunk({
          key,
          noncePrefix,
          attachmentId,
          chunkIndex: i,
          chunkCount,
          plaintextSize: size,
          plaintext: original.subarray(start, start + len),
        });
        recovered.set(
          decryptChunk({
            key,
            noncePrefix,
            attachmentId,
            chunkIndex: i,
            chunkCount,
            plaintextSize: size,
            ciphertext,
          }),
          start,
        );
      }
      expect(recovered).toEqual(original);
    });

  test("AAD is deterministic", () => {
    const a = buildChunkAad({
      attachmentId,
      chunkIndex: 3,
      chunkCount: 9,
      plaintextSize: 1000,
    });
    const b = buildChunkAad({
      attachmentId,
      chunkIndex: 3,
      chunkCount: 9,
      plaintextSize: 1000,
    });
    expect(a).toEqual(b);
    expect(a[13]).toBe(0x1f);
  });
});
