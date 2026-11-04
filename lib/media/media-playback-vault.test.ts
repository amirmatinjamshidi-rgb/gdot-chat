import { describe, expect, it, vi } from "vitest";

import {
  encryptChunk,
  generateMediaKey,
  generateNoncePrefix,
  plainChunkLength,
} from "@/lib/crypto/media-aead";
import { packCipherChunks } from "@/lib/media/media-pack";
import {
  MediaPlaybackVault,
  MemoryVaultFileAccess,
} from "@/lib/media/media-playback-vault";
import type { LocalAttachment } from "@/lib/db/types";

function makePacked(attachmentId: string, plain: Uint8Array, key: Uint8Array, nonce: Uint8Array) {
  const chunkSize = 16;
  const chunkCount = Math.ceil(plain.length / chunkSize) || 1;
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < chunkCount; i++) {
    const len = plainChunkLength(plain.length, chunkSize, i, chunkCount);
    chunks.push(
      encryptChunk({
        key,
        noncePrefix: nonce,
        attachmentId,
        chunkIndex: i,
        chunkCount,
        plaintextSize: plain.length,
        plaintext: plain.subarray(i * chunkSize, i * chunkSize + len),
      }),
    );
  }
  return { packed: packCipherChunks(chunks), chunkSize, chunkCount };
}

describe("MediaPlaybackVault streaming register", () => {
  it("registers packed format with native and never writes tmp plaintext", async () => {
    const key = generateMediaKey();
    const nonce = generateNoncePrefix();
    const attachmentId = "att-vault-1";
    const plain = new Uint8Array(40).map((_, i) => i);
    const { packed, chunkSize, chunkCount } = makePacked(attachmentId, plain, key, nonce);
    const files = new MemoryVaultFileAccess();
    const registerSession = vi.fn();
    const clearAll = vi.fn();
    const vault = new MediaPlaybackVault({
      files,
      native: {
        registerSession,
        unregisterSession: vi.fn(),
        clearAll,
      },
    });
    const durable = await vault.persistPackedCipher(attachmentId, packed);
    const row = {
      attachmentId,
      messageId: "m1",
      kind: "voice",
      mimeType: "audio/mp4",
      plainSizeBytes: plain.length,
      chunkSize,
      chunkCount,
      mediaKey: key,
      noncePrefix: nonce,
      localUri: durable,
      atRestEncrypted: true,
      transferState: "available",
      uploadedChunks: [],
      downloadedChunks: [],
      createdAt: 1,
      updatedAt: 1,
    } as LocalAttachment;

    expect(await vault.registerForPlayback(row)).toBe(true);
    expect(registerSession).toHaveBeenCalledOnce();
    expect(registerSession.mock.calls[0]![0].format).toBe("packed");
    expect(files.tmp.size).toBe(0);

    await vault.clearOnLock();
    expect(clearAll).toHaveBeenCalledOnce();
    expect(vault.isRegistered(attachmentId)).toBe(false);
  });
});
