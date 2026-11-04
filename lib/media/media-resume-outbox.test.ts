import { describe, expect, it, vi } from "vitest";

import {
  encryptChunk,
  generateMediaKey,
  generateNoncePrefix,
} from "@/lib/crypto/media-aead";
import { MemoryOutboxStore } from "@/lib/db/outbox-store";
import {
  MemoryAttachmentStore,
  MemoryConversationStore,
  MemoryIdentityStore,
  MemoryMessageStore,
} from "@/lib/test/memory-stores";
import { MemoryMediaBlobCache } from "@/lib/media/media-blob-cache";
import { MemoryRandomAccessFile } from "@/lib/media/random-access-file";
import { MediaTransferService } from "@/lib/media/media-transfer";
import {
  MediaPlaybackVault,
  MemoryVaultFileAccess,
} from "@/lib/media/media-playback-vault";
import { cipherFileSize } from "@/lib/media/media-at-rest";
import type { AttachmentsApi } from "@/lib/api/attachments-api";
import type { LocalAttachment } from "@/lib/db/types";

describe("B1 media resume keeps packed ciphertext", () => {
  it("resumeOutgoing caches encryptedBlob via mediaBlobCache.put", async () => {
    const plain = new Uint8Array(40).map((_, i) => (i * 3) & 0xff);
    const attachmentId = crypto.randomUUID();
    const messageId = crypto.randomUUID();
    const clientId = crypto.randomUUID();
    const conversationId = crypto.randomUUID();
    const peerUserId = crypto.randomUUID();
    const peerDeviceId = crypto.randomUUID();
    const key = generateMediaKey();
    const noncePrefix = generateNoncePrefix();
    const chunkSize = 16;
    const chunkCount = Math.ceil(plain.length / chunkSize);

    const wireChunks = new Map<number, Uint8Array>();
    // Pretend first chunk already uploaded before interrupt.
    {
      const len = 16;
      const ct = encryptChunk({
        key,
        noncePrefix,
        attachmentId,
        chunkIndex: 0,
        chunkCount,
        plaintextSize: plain.length,
        plaintext: plain.subarray(0, len),
      });
      wireChunks.set(0, ct);
    }

    const putSpy = vi.fn(async () => "stored" as const);
    const blobCache = new MemoryMediaBlobCache();
    blobCache.put = putSpy;

    const attachmentsApi = {
      create: async () => ({
        attachmentId,
        chunkSizeBytes: chunkSize,
        chunkCount,
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      }),
      putChunk: async (_id: string, index: number, ciphertext: Uint8Array) => {
        wireChunks.set(index, new Uint8Array(ciphertext));
      },
      complete: async () => undefined,
      getStatus: async () => ({
        attachmentId,
        sizeBytes: plain.length,
        chunkSizeBytes: chunkSize,
        chunkCount,
        uploadedChunks: [...wireChunks.keys()],
        status: "uploading",
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      }),
      getChunk: async () => new Uint8Array(),
      downloadComplete: async () => undefined,
      delete: async () => undefined,
    } as unknown as AttachmentsApi;

    const identityStore = new MemoryIdentityStore();
    identityStore.local = {
      userId: crypto.randomUUID(),
      deviceId: crypto.randomUUID(),
      username: "me",
      registrationId: 1,
      identityKeyPublic: new Uint8Array(32),
    };
    const conversationStore = new MemoryConversationStore();
    await conversationStore.upsert({
      id: conversationId,
      peerUserId,
      peerUsername: "peer",
      peerDeviceId,
      lastMessagePreview: "",
      lastMessageAt: 0,
      unreadCount: 0,
    });
    const messageStore = new MemoryMessageStore();
    await messageStore.insert({
      id: messageId,
      clientId,
      conversationId,
      direction: "outgoing",
      kind: "voice",
      plaintext: "",
      status: "uploading",
      senderDeviceId: identityStore.local.deviceId,
      createdAt: 1_000,
      attachmentId,
    });
    const attachmentStore = new MemoryAttachmentStore();
    const row: LocalAttachment = {
      attachmentId,
      messageId,
      kind: "voice",
      mimeType: "audio/mp4",
      plainSizeBytes: plain.length,
      chunkSize,
      chunkCount,
      mediaKey: key,
      noncePrefix,
      sourceUri: "mem://source",
      localUri: "mem://source",
      transferState: "uploading",
      uploadedChunks: [0],
      downloadedChunks: [],
      createdAt: 1_000,
      updatedAt: 1_000,
    };
    await attachmentStore.upsert(row);

    const source = new MemoryRandomAccessFile(plain);
    const media = new MediaTransferService(
      attachmentsApi,
      messageStore,
      attachmentStore,
      conversationStore,
      identityStore,
      async () => ({ envelopeId: crypto.randomUUID() }),
      {
        openExistingFile: async () => source,
        createOutputFile: async (id, _ext, size) => {
          const file = new MemoryRandomAccessFile(new Uint8Array(size));
          return { file, uri: `mem://${id}` };
        },
      },
      { clock: () => 50_000, mediaBlobCache: blobCache },
    );

    // resumeInterrupted → resumeOutgoing
    await (media as unknown as { resumeOutgoing: (r: LocalAttachment) => Promise<void> })
      .resumeOutgoing(row);

    expect(putSpy).toHaveBeenCalled();
    const firstCall = putSpy.mock.calls[0] as unknown as [string, Uint8Array, number];
    expect(firstCall[1].byteLength).toBeGreaterThan(0);
    // All chunks uploaded after resume
    expect(wireChunks.size).toBe(chunkCount);
  });
});

describe("B5 media at-rest vault", () => {
  it("persists ciphertext and materializes plaintext only in tmp; wipe on lock", async () => {
    const plain = new Uint8Array(32).map((_, i) => i + 1);
    const key = generateMediaKey();
    const noncePrefix = generateNoncePrefix();
    const attachmentId = crypto.randomUUID();
    const chunkSize = 16;
    const chunkCount = 2;

    const files = new MemoryVaultFileAccess();
    const vault = new MediaPlaybackVault({ files });

    const { encryptPlaintextToPackedCipher } = await import(
      "@/lib/media/media-at-rest"
    );
    const packed = encryptPlaintextToPackedCipher({
      key,
      noncePrefix,
      attachmentId,
      plainSize: plain.length,
      chunkSize,
      chunkCount,
      plaintext: plain,
    });
    const durable = await vault.persistPackedCipher(attachmentId, packed);
    expect(durable.endsWith(".genc")).toBe(true);
    // Durable bytes are not plaintext
    expect(Buffer.from(await files.readFileBytes(durable)).equals(Buffer.from(plain))).toBe(
      false,
    );

    const row: LocalAttachment = {
      attachmentId,
      messageId: crypto.randomUUID(),
      kind: "voice",
      mimeType: "audio/mp4",
      plainSizeBytes: plain.length,
      chunkSize,
      chunkCount,
      mediaKey: key,
      noncePrefix,
      localUri: durable,
      atRestEncrypted: true,
      transferState: "available",
      uploadedChunks: [],
      downloadedChunks: [0, 1],
      createdAt: 1,
      updatedAt: 1,
    };

    const playback = await vault.ensurePlaybackUri(row);
    expect(playback).toBeTruthy();
    expect(playback!.includes("gdot-media-tmp")).toBe(true);
    const played = await files.readFileBytes(playback!);
    expect(Buffer.from(played).equals(Buffer.from(plain))).toBe(true);

    await vault.clearOnLock();
    expect(files.tmp.size).toBe(0);
    expect(vault.getCachedPlaybackUri(attachmentId)).toBeUndefined();
    // Durable ciphertext remains
    expect(files.durable.size).toBe(1);
  });

  it("download writes ciphertext slots not plaintext", async () => {
    const plain = new Uint8Array(24).map((_, i) => (i * 5) & 0xff);
    const key = generateMediaKey();
    const noncePrefix = generateNoncePrefix();
    const attachmentId = crypto.randomUUID();
    const messageId = crypto.randomUUID();
    const conversationId = crypto.randomUUID();
    const chunkSize = 16;
    const chunkCount = 2;

    const wire = new Map<number, Uint8Array>();
    for (let i = 0; i < chunkCount; i++) {
      const start = i * chunkSize;
      const slice = plain.subarray(start, Math.min(start + chunkSize, plain.length));
      wire.set(
        i,
        encryptChunk({
          key,
          noncePrefix,
          attachmentId,
          chunkIndex: i,
          chunkCount,
          plaintextSize: plain.length,
          plaintext: slice,
        }),
      );
    }

    const outputs = new Map<string, MemoryRandomAccessFile>();
    const attachmentsApi = {
      getStatus: async () => ({
        attachmentId,
        sizeBytes: plain.length,
        chunkSizeBytes: chunkSize,
        chunkCount,
        uploadedChunks: [0, 1],
        status: "ready",
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      }),
      getChunk: async (_id: string, index: number) => wire.get(index)!,
      downloadComplete: async () => undefined,
    } as unknown as AttachmentsApi;

    const messageStore = new MemoryMessageStore();
    await messageStore.insert({
      id: messageId,
      clientId: crypto.randomUUID(),
      conversationId,
      direction: "incoming",
      kind: "voice",
      plaintext: "",
      status: "pending",
      senderDeviceId: "peer",
      createdAt: 1,
      attachmentId,
    });
    const attachmentStore = new MemoryAttachmentStore();
    await attachmentStore.upsert({
      attachmentId,
      messageId,
      kind: "voice",
      mimeType: "audio/mp4",
      plainSizeBytes: plain.length,
      chunkSize,
      chunkCount,
      mediaKey: key,
      noncePrefix,
      transferState: "pending",
      uploadedChunks: [],
      downloadedChunks: [],
      createdAt: 1,
      updatedAt: 1,
    });

    const media = new MediaTransferService(
      attachmentsApi,
      messageStore,
      attachmentStore,
      new MemoryConversationStore(),
      new MemoryIdentityStore(),
      async () => ({ envelopeId: "x" }),
      {
        openExistingFile: async (uri) => {
          const f = outputs.get(uri);
          if (!f) throw new Error("missing");
          return f;
        },
        createOutputFile: async (id, _ext, size) => {
          const file = new MemoryRandomAccessFile(new Uint8Array(size));
          const uri = `mem://gdot-media/${id}.genc`;
          outputs.set(uri, file);
          return { file, uri };
        },
      },
    );

    await media.downloadAttachment(attachmentId);
    const stored = await attachmentStore.get(attachmentId);
    expect(stored?.atRestEncrypted).toBe(true);
    expect(stored?.localUri?.endsWith(".genc")).toBe(true);
    const file = outputs.get(stored!.localUri!);
    expect(file).toBeTruthy();
    const bytes = file!.bytes();
    // File must not equal plaintext
    expect(bytes.byteLength).toBe(
      cipherFileSize(plain.length, chunkSize, chunkCount),
    );
    expect(Buffer.from(bytes.subarray(0, plain.length)).equals(Buffer.from(plain))).toBe(
      false,
    );
  });
});

describe("B2 group media goes through outbox", () => {
  it("finishOutgoingSignal upserts outbox for groupId", async () => {
    const plain = new Uint8Array(16).fill(7);
    const attachmentId = crypto.randomUUID();
    const messageId = crypto.randomUUID();
    const clientId = crypto.randomUUID();
    const groupId = crypto.randomUUID();
    const key = generateMediaKey();
    const noncePrefix = generateNoncePrefix();

    const outbox = new MemoryOutboxStore();
    const wireChunks = new Map<number, Uint8Array>();
    const attachmentsApi = {
      create: async () => ({
        attachmentId,
        chunkSizeBytes: 16,
        chunkCount: 1,
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      }),
      putChunk: async (_id: string, index: number, ciphertext: Uint8Array) => {
        wireChunks.set(index, new Uint8Array(ciphertext));
      },
      complete: async () => undefined,
      getStatus: async () => ({
        attachmentId,
        sizeBytes: plain.length,
        chunkSizeBytes: 16,
        chunkCount: 1,
        uploadedChunks: [...wireChunks.keys()],
        status: "uploading",
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      }),
      getChunk: async () => new Uint8Array(),
      downloadComplete: async () => undefined,
      delete: async () => undefined,
    } as unknown as AttachmentsApi;

    const identityStore = new MemoryIdentityStore();
    identityStore.local = {
      userId: crypto.randomUUID(),
      deviceId: crypto.randomUUID(),
      username: "me",
      registrationId: 1,
      identityKeyPublic: new Uint8Array(32),
    };
    const messageStore = new MemoryMessageStore();
    const attachmentStore = new MemoryAttachmentStore();
    const conversationStore = new MemoryConversationStore();
    const files = new MemoryVaultFileAccess();
    const vault = new MediaPlaybackVault({ files });

    const media = new MediaTransferService(
      attachmentsApi,
      messageStore,
      attachmentStore,
      conversationStore,
      identityStore,
      async () => ({ envelopeId: "dm" }),
      {
        openExistingFile: async () => new MemoryRandomAccessFile(plain),
        createOutputFile: async (id, _e, size) => ({
          file: new MemoryRandomAccessFile(new Uint8Array(size)),
          uri: `mem://${id}`,
        }),
      },
      {
        outboxStore: outbox,
        mediaVault: vault,
        clock: () => 9_000,
        sendGroupPlaintext: async () => ({ envelopeIds: ["g-env-1"] }),
      },
    );

    await media.sendOutgoingMedia({
      conversationId: groupId,
      groupId,
      uri: "mem://src",
      kind: "voice",
      mimeType: "audio/mp4",
      durationMs: 500,
    });

    const pending = await outbox.listPendingGroups(9_000);
    expect(pending.length).toBe(1);
    expect(pending[0]?.groupId).toBe(groupId);
    expect(pending[0]?.payloadKind).toBe("media");
    const row = await attachmentStore.get(attachmentId);
    expect(row?.atRestEncrypted).toBe(true);
    expect(row?.groupId).toBe(groupId);
  });
});
