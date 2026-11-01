import { describe, expect, it, vi } from "vitest";

import {
  decryptChunk,
  generateMediaKey,
  generateNoncePrefix,
} from "@/lib/crypto/media-aead";
import {
  MemoryAttachmentStore,
  MemoryConversationStore,
  MemoryIdentityStore,
  MemoryMessageStore,
} from "@/lib/test/memory-stores";
import { MemoryRandomAccessFile } from "@/lib/media/random-access-file";
import { MediaTransferService } from "@/lib/media/media-transfer";
import type { AttachmentsApi } from "@/lib/api/attachments-api";
import { parseSignalPlaintext } from "@/lib/protocol/payload";

describe("MediaTransferService network path", () => {
  it("uploads encrypted chunks then posts Signal descriptor (no plaintext on wire)", async () => {
    const peerUserId = crypto.randomUUID();
    const peerDeviceId = crypto.randomUUID();
    const conversationId = crypto.randomUUID();
    const localUserId = crypto.randomUUID();
    const localDeviceId = crypto.randomUUID();
    const attachmentId = crypto.randomUUID();
    const plain = new Uint8Array(40).map((_, i) => (i * 7) & 0xff);

    const wireChunks = new Map<number, Uint8Array>();
    let completed = false;
    const createBodies: unknown[] = [];
    const signalPlaintexts: string[] = [];

    const attachmentsApi = {
      create: async (body: {
        recipientUserId: string;
        recipientDeviceId: string;
        sizeBytes: number;
      }) => {
        createBodies.push(body);
        return {
          attachmentId,
          chunkSizeBytes: 16,
          chunkCount: Math.ceil(plain.length / 16),
          expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        };
      },
      putChunk: async (id: string, index: number, ciphertext: Uint8Array) => {
        expect(id).toBe(attachmentId);
        wireChunks.set(index, new Uint8Array(ciphertext));
      },
      complete: async (id: string) => {
        expect(id).toBe(attachmentId);
        completed = true;
      },
      getStatus: async () => ({
        attachmentId,
        sizeBytes: plain.length,
        chunkSizeBytes: 16,
        chunkCount: Math.ceil(plain.length / 16),
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
      userId: localUserId,
      deviceId: localDeviceId,
      username: `me_${localUserId.slice(0, 6)}`,
      registrationId: 1,
      identityKeyPublic: new Uint8Array(32),
    };
    const conversationStore = new MemoryConversationStore();
    await conversationStore.upsert({
      id: conversationId,
      peerUserId,
      peerUsername: `peer_${peerUserId.slice(0, 6)}`,
      peerDeviceId,
      lastMessagePreview: "",
      lastMessageAt: 0,
      unreadCount: 0,
    });
    const messageStore = new MemoryMessageStore();
    const attachmentStore = new MemoryAttachmentStore();

    const source = new MemoryRandomAccessFile(plain);
    const outputs = new Map<string, MemoryRandomAccessFile>();

    const media = new MediaTransferService(
      attachmentsApi,
      messageStore,
      attachmentStore,
      conversationStore,
      identityStore,
      async (_c, plaintext) => {
        signalPlaintexts.push(plaintext);
        return { envelopeId: crypto.randomUUID() };
      },
      {
        openExistingFile: async () => source,
        createOutputFile: async (id, _ext, size) => {
          const file = new MemoryRandomAccessFile(new Uint8Array(size));
          outputs.set(id, file);
          return { file, uri: `mem://${id}` };
        },
      },
      { clock: () => 50_000 },
    );

    await media.sendOutgoingMedia({
      conversationId,
      uri: "mem://source",
      kind: "voice",
      mimeType: "audio/mp4",
      durationMs: 900,
    });

    expect(createBodies).toEqual([
      {
        recipientUserId: peerUserId,
        recipientDeviceId: peerDeviceId,
        sizeBytes: plain.length,
      },
    ]);
    expect(completed).toBe(true);
    expect(wireChunks.size).toBe(Math.ceil(plain.length / 16));
    for (const chunk of wireChunks.values()) {
      expect(chunk).not.toEqual(plain.subarray(0, chunk.length));
      expect(JSON.stringify([...chunk])).not.toContain(
        JSON.stringify([...plain.subarray(0, 8)]),
      );
    }
    expect(signalPlaintexts).toHaveLength(1);
    const parsed = parseSignalPlaintext(signalPlaintexts[0]!);
    expect(parsed.kind).toBe("media");
    if (parsed.kind !== "media") throw new Error("expected media");
    expect(parsed.payload.attachmentId).toBe(attachmentId);
    // Descriptor carries keys; HTTP create body must not.
    expect(JSON.stringify(createBodies[0])).not.toContain(parsed.payload.key);

    const row = await attachmentStore.get(attachmentId);
    expect(["ready", "available"]).toContain(row?.transferState);
    const msgs = await messageStore.listByConversation(conversationId, 5);
    expect(msgs[0]?.status).toBe("sent");
  });

  it("downloads chunks over API and decrypts to original bytes", async () => {
    const attachmentId = crypto.randomUUID();
    const plain = new Uint8Array(24).map((_, i) => i + 1);
    const key = generateMediaKey();
    const noncePrefix = generateNoncePrefix();
    const chunkSize = 8;
    const chunkCount = Math.ceil(plain.length / chunkSize);
    const relay = new Map<number, Uint8Array>();
    for (let i = 0; i < chunkCount; i++) {
      const start = i * chunkSize;
      const slice = plain.subarray(start, Math.min(plain.length, start + chunkSize));
      const { encryptChunk, plainChunkLength } = await import(
        "@/lib/crypto/media-aead"
      );
      const len = plainChunkLength(plain.length, chunkSize, i, chunkCount);
      relay.set(
        i,
        encryptChunk({
          key,
          noncePrefix,
          attachmentId,
          chunkIndex: i,
          chunkCount,
          plaintextSize: plain.length,
          plaintext: plain.subarray(start, start + len),
        }),
      );
    }

    const attachmentsApi = {
      getStatus: async () => ({
        attachmentId,
        sizeBytes: plain.length,
        chunkSizeBytes: chunkSize,
        chunkCount,
        uploadedChunks: [...relay.keys()],
        status: "ready",
        expiresAt: new Date(Date.now() + 1000).toISOString(),
      }),
      getChunk: async (_id: string, index: number) => relay.get(index)!,
      downloadComplete: async () => undefined,
    } as unknown as AttachmentsApi;

    const messageStore = new MemoryMessageStore();
    const attachmentStore = new MemoryAttachmentStore();
    const conversationStore = new MemoryConversationStore();
    const identityStore = new MemoryIdentityStore();
    const messageId = crypto.randomUUID();
    await messageStore.insert({
      id: messageId,
      clientId: crypto.randomUUID(),
      conversationId: crypto.randomUUID(),
      direction: "incoming",
      kind: "voice",
      plaintext: "",
      status: "delivered",
      senderDeviceId: crypto.randomUUID(),
      createdAt: 1,
      attachmentId,
    });
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

    let dest: MemoryRandomAccessFile | null = null;
    const media = new MediaTransferService(
      attachmentsApi,
      messageStore,
      attachmentStore,
      conversationStore,
      identityStore,
      async () => ({ envelopeId: crypto.randomUUID() }),
      {
        openExistingFile: async () => {
          throw new Error("no source");
        },
        createOutputFile: async (_id, _ext, size) => {
          dest = new MemoryRandomAccessFile(new Uint8Array(size));
          return { file: dest, uri: "mem://out" };
        },
      },
    );

    await media.downloadAttachment(attachmentId);
    expect(dest).not.toBeNull();
    const out = await dest!.read(0, plain.length);
    expect([...out]).toEqual([...plain]);
    const row = await attachmentStore.get(attachmentId);
    expect(row?.transferState).toBe("available");
  });
});
