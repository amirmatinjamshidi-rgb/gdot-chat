import { describe, expect, it } from "vitest";

import { encryptChunk, generateMediaKey, generateNoncePrefix, plainChunkLength } from "@/lib/crypto/media-aead";
import {
  MemoryAttachmentStore,
  MemoryConversationStore,
  MemoryIdentityStore,
  MemoryMessageStore,
} from "@/lib/test/memory-stores";
import { MemoryRandomAccessFile } from "@/lib/media/random-access-file";
import { MediaTransferService } from "@/lib/media/media-transfer";
import type { AttachmentsApi } from "@/lib/api/attachments-api";
import { encodeMediaKey, encodeNoncePrefix, MEDIA_ALGORITHM, parseSignalPlaintext } from "@/lib/protocol/payload";

/**
 * E2E: Alice uploads → opaque relay store → Bob downloads & decrypts.
 */
describe("media network E2E Alice→relay→Bob", () => {
  it("round-trips voice bytes through mock attachment API", async () => {
    const plain = new Uint8Array(33).map((_, i) => 255 - i);
    const relay = new Map<number, Uint8Array>();
    let meta: {
      attachmentId: string;
      chunkSizeBytes: number;
      chunkCount: number;
      sizeBytes: number;
    } | null = null;

    const attachmentsApi = {
      create: async (body: { sizeBytes: number }) => {
        const attachmentId = crypto.randomUUID();
        const chunkSizeBytes = 16;
        const chunkCount = Math.ceil(body.sizeBytes / chunkSizeBytes);
        meta = {
          attachmentId,
          chunkSizeBytes,
          chunkCount,
          sizeBytes: body.sizeBytes,
        };
        return {
          attachmentId,
          chunkSizeBytes,
          chunkCount,
          expiresAt: new Date(Date.now() + 1000).toISOString(),
        };
      },
      putChunk: async (_id: string, index: number, ciphertext: Uint8Array) => {
        relay.set(index, new Uint8Array(ciphertext));
      },
      complete: async () => undefined,
      getStatus: async () => ({
        attachmentId: meta!.attachmentId,
        sizeBytes: meta!.sizeBytes,
        chunkSizeBytes: meta!.chunkSizeBytes,
        chunkCount: meta!.chunkCount,
        uploadedChunks: [...relay.keys()],
        status: "ready",
        expiresAt: new Date(Date.now() + 1000).toISOString(),
      }),
      getChunk: async (_id: string, index: number) => relay.get(index)!,
      downloadComplete: async () => undefined,
      delete: async () => undefined,
    } as unknown as AttachmentsApi;

    const aliceConv = crypto.randomUUID();
    const peerUser = crypto.randomUUID();
    const peerDevice = crypto.randomUUID();
    const aliceIdentity = new MemoryIdentityStore();
    aliceIdentity.local = {
      userId: crypto.randomUUID(),
      deviceId: crypto.randomUUID(),
      username: "alice",
      registrationId: 1,
      identityKeyPublic: new Uint8Array(32),
    };
    const aliceConvStore = new MemoryConversationStore();
    await aliceConvStore.upsert({
      id: aliceConv,
      peerUserId: peerUser,
      peerUsername: "bob",
      peerDeviceId: peerDevice,
      lastMessagePreview: "",
      lastMessageAt: 0,
      unreadCount: 0,
    });
    const aliceMessages = new MemoryMessageStore();
    const aliceAttachments = new MemoryAttachmentStore();
    let descriptorPlain: string | null = null;

    const alice = new MediaTransferService(
      attachmentsApi,
      aliceMessages,
      aliceAttachments,
      aliceConvStore,
      aliceIdentity,
      async (_c, plaintext) => {
        descriptorPlain = plaintext;
        return { envelopeId: crypto.randomUUID() };
      },
      {
        openExistingFile: async () => new MemoryRandomAccessFile(plain),
        createOutputFile: async () => {
          throw new Error("alice upload only");
        },
      },
      { clock: () => 1000 },
    );

    await alice.sendOutgoingMedia({
      conversationId: aliceConv,
      uri: "mem://alice",
      kind: "voice",
      mimeType: "audio/mp4",
    });
    expect(descriptorPlain).not.toBeNull();
    const parsed = parseSignalPlaintext(descriptorPlain!);
    expect(parsed.kind).toBe("media");
    if (parsed.kind !== "media") throw new Error("media");

    // Bob side
    const bobMessages = new MemoryMessageStore();
    const bobAttachments = new MemoryAttachmentStore();
    const bobConvStore = new MemoryConversationStore();
    const bobIdentity = new MemoryIdentityStore();
    const bobConvId = crypto.randomUUID();
    await bobConvStore.upsert({
      id: bobConvId,
      peerUserId: aliceIdentity.local!.userId,
      peerUsername: "alice",
      peerDeviceId: aliceIdentity.local!.deviceId,
      lastMessagePreview: "",
      lastMessageAt: 0,
      unreadCount: 0,
    });

    let bobFile: MemoryRandomAccessFile | null = null;
    const bob = new MediaTransferService(
      attachmentsApi,
      bobMessages,
      bobAttachments,
      bobConvStore,
      bobIdentity,
      async () => ({ envelopeId: crypto.randomUUID() }),
      {
        openExistingFile: async () => {
          throw new Error("no");
        },
        createOutputFile: async (_id, _e, size) => {
          bobFile = new MemoryRandomAccessFile(new Uint8Array(size));
          return { file: bobFile, uri: "mem://bob" };
        },
      },
    );

    await bob.ingestIncomingMedia({
      conversation: (await bobConvStore.getById(bobConvId))!,
      payload: parsed.payload,
      senderDeviceId: aliceIdentity.local!.deviceId,
      serverEnvelopeId: crypto.randomUUID(),
      createdAt: 2000,
      messageType: 3,
    });
    await bob.downloadAttachment(parsed.payload.attachmentId);
    const out = await bobFile!.read(0, plain.length);
    expect([...out]).toEqual([...plain]);
  });
});
