import { describe, expect, test } from "vitest";

import {
  decryptChunk,
  encryptChunk,
  generateMediaKey,
  generateNoncePrefix,
  plainChunkLength,
} from "@/lib/crypto/media-aead";
import { MemoryRandomAccessFile } from "@/lib/media/random-access-file";
import {
  encodeMediaKey,
  encodeNoncePrefix,
  MEDIA_ALGORITHM,
  parseSignalPlaintext,
  serializeMediaPayload,
  serializeTextPayload,
  type MediaPayload,
} from "@/lib/protocol/payload";

describe("encrypted media pipeline", () => {
  test("chunk encrypt, opaque relay, Signal descriptor, decrypt equals original", async () => {
    const original = new Uint8Array(50).map((_, i) => i);
    const source = new MemoryRandomAccessFile(original);
    const key = generateMediaKey();
    const noncePrefix = generateNoncePrefix();
    const attachmentId = "11111111-1111-4111-8111-111111111111";
    const chunkSize = 16;
    const chunkCount = Math.ceil(original.length / chunkSize);

    const relayChunks = new Map<number, Uint8Array>();
    const createBody = {
      recipientUserId: "bob-user",
      recipientDeviceId: "bob-device",
      sizeBytes: original.length,
    };

    for (let i = 0; i < chunkCount; i++) {
      const len = plainChunkLength(original.length, chunkSize, i, chunkCount);
      const plaintext = await source.read(i * chunkSize, len);
      const ciphertext = encryptChunk({
        key,
        noncePrefix,
        attachmentId,
        chunkIndex: i,
        chunkCount,
        plaintextSize: original.length,
        plaintext,
      });
      relayChunks.set(i, ciphertext);
    }

    const descriptor: MediaPayload = {
      v: 1,
      t: "media",
      kind: "voice",
      attachmentId,
      algorithm: MEDIA_ALGORITHM,
      size: original.length,
      chunkSize,
      chunkCount,
      mimeType: "audio/mp4",
      durationMs: 1200,
      key: encodeMediaKey(key),
      noncePrefix: encodeNoncePrefix(noncePrefix),
    };
    const signalPlaintext = serializeMediaPayload(descriptor);
    const parsed = parseSignalPlaintext(signalPlaintext);
    expect(parsed.kind).toBe("media");
    if (parsed.kind !== "media") throw new Error("expected media");

    const httpJson = JSON.stringify({ createBody, uploaded: [...relayChunks.keys()] });
    expect(httpJson).not.toContain(parsed.payload.key);
    expect(httpJson).not.toContain(parsed.payload.noncePrefix);
    for (const stored of relayChunks.values()) {
      expect(stored).not.toEqual(original);
    }

    const dest = new MemoryRandomAccessFile(new Uint8Array(parsed.payload.size));
    for (let i = 0; i < parsed.payload.chunkCount; i++) {
      const ciphertext = relayChunks.get(i);
      if (!ciphertext) throw new Error("missing chunk");
      const plain = decryptChunk({
        key,
        noncePrefix,
        attachmentId: parsed.payload.attachmentId,
        chunkIndex: i,
        chunkCount: parsed.payload.chunkCount,
        plaintextSize: parsed.payload.size,
        ciphertext,
      });
      await dest.write(i * parsed.payload.chunkSize, plain);
    }

    expect(dest.bytes()).toEqual(original);
  });

  test("legacy and typed text stay text", () => {
    expect(parseSignalPlaintext("hello").kind).toBe("legacy-text");
    expect(parseSignalPlaintext(serializeTextPayload("hello")).kind).toBe("text");
  });
});
