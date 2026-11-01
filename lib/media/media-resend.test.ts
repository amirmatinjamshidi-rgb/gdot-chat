import { describe, expect, it } from "vitest";

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
  MemoryReactionStore,
  MemorySessionStore,
} from "@/lib/test/memory-stores";
import { MemoryEnvelopeAttemptStore } from "@/lib/db/envelope-attempt-store";
import { MemoryEnvelopeQuarantineStore } from "@/lib/db/envelope-quarantine-store";
import { MemoryMediaBlobCache } from "@/lib/media/media-blob-cache";
import {
  MEDIA_BLOB_CACHE_MAX_BYTES,
} from "@/lib/media/media-blob-constants";
import {
  MediaTransferService,
  packCipherChunks,
} from "@/lib/media/media-transfer";
import {
  MEDIA_ALGORITHM,
  encodeMediaKey,
  encodeNoncePrefix,
  serializeMediaPayload,
  type MediaPayload,
} from "@/lib/protocol/payload";
import { OUTBOX_TTL_MS } from "@/lib/session/outbox-constants";
import { SyncService } from "@/lib/session/sync-service";

function makeDescriptor(
  attachmentId: string,
  clientMessageId: string,
  size = 64,
): MediaPayload {
  const key = generateMediaKey();
  const noncePrefix = generateNoncePrefix();
  return {
    v: 1,
    t: "media",
    kind: "voice",
    attachmentId,
    algorithm: MEDIA_ALGORITHM,
    size,
    chunkSize: size,
    chunkCount: 1,
    mimeType: "audio/mp4",
    key: encodeMediaKey(key),
    noncePrefix: encodeNoncePrefix(noncePrefix),
    clientMessageId,
  };
}

describe("Media blob cache", () => {
  it("stores under cap and rejects over cap; TTL eviction works with injected clock", async () => {
    const cache = new MemoryMediaBlobCache();
    let now = 1_000;
    const id = crypto.randomUUID();
    const ok = await cache.put(id, new Uint8Array(16), now, {
      maxBytes: 32,
      ttlMs: 100,
    });
    expect(ok).toBe("stored");
    expect((await cache.get(id, now))?.byteLength).toBe(16);
    const over = await cache.put(crypto.randomUUID(), new Uint8Array(MEDIA_BLOB_CACHE_MAX_BYTES + 1), now);
    expect(over).toBe("over_cap");
    now += 200;
    expect(await cache.get(id, now)).toBeNull();
  });
});

describe("Media resend after session reset (full method)", () => {
  it("resends descriptor when server attachment still exists", async () => {
    let now = 10_000;
    const bobUser = crypto.randomUUID();
    const bobDevice = crypto.randomUUID();
    const aliceUser = crypto.randomUUID();
    const aliceDevice = crypto.randomUUID();
    const conversationId = crypto.randomUUID();
    const clientMessageId = crypto.randomUUID();
    const attachmentId = crypto.randomUUID();
    const descriptor = makeDescriptor(attachmentId, clientMessageId);

    const outbox = new MemoryOutboxStore();
    await outbox.upsertPending({
      clientMessageId,
      localMessageId: crypto.randomUUID(),
      conversationId,
      peerUserId: aliceUser,
      peerDeviceId: aliceDevice,
      plaintext: serializeMediaPayload(descriptor),
      payloadKind: "media",
      mediaAttachmentId: attachmentId,
      mediaBlobCached: true,
      createdAt: now,
      expiresAt: now + OUTBOX_TTL_MS,
    });

    const posted: string[] = [];
    const identity = new MemoryIdentityStore();
    identity.local = {
      userId: bobUser,
      deviceId: bobDevice,
      username: "bob",
      registrationId: 1,
      identityKeyPublic: new Uint8Array(32),
    };
    const conversations = new MemoryConversationStore();
    conversations.conversations.set(conversationId, {
      id: conversationId,
      peerUserId: aliceUser,
      peerUsername: "alice",
      peerDeviceId: aliceDevice,
      lastMessagePreview: "",
      lastMessageAt: 0,
      unreadCount: 0,
    });

    const sync = new SyncService(
      {
        abortBackground: async () => undefined,
        send: async () => ({ envelopeId: crypto.randomUUID() }),
      } as never,
      {
        runWithTransportPaused: async <T>(fn: () => Promise<T>) => fn(),
        setPreKeysLowHandler: () => undefined,
        setSessionResetHandler: () => undefined,
        setEnvelopeHandler: () => undefined,
        setConnectionHandler: () => undefined,
      } as never,
      {
        encryptOutgoing: async (_u: string, _d: string, plaintext: string) => {
          posted.push(plaintext);
          return {
            recipientUserId: aliceUser,
            recipientDeviceId: aliceDevice,
            messageType: 2,
            ciphertextBase64: Buffer.from(plaintext).toString("base64"),
          };
        },
        replenishLocalPreKeysIfNeeded: async () => undefined,
      } as never,
      new MemoryMessageStore(),
      conversations,
      identity,
      { getAccessToken: async () => "tok" } as never,
      new MemoryReactionStore(),
      null,
      {
        quarantineStore: new MemoryEnvelopeQuarantineStore(),
        attemptStore: new MemoryEnvelopeAttemptStore(),
        sessionResetApi: { request: async () => undefined } as never,
        sessionStore: new MemorySessionStore(),
        outboxStore: outbox,
        clock: () => now,
        attachmentExists: async () => true,
        mediaBlobCache: new MemoryMediaBlobCache(),
      },
    );

    await sync.handleSessionResetRequested(aliceDevice);
    expect(posted).toHaveLength(1);
    expect(JSON.parse(posted[0]!).attachmentId).toBe(attachmentId);
    expect(JSON.parse(posted[0]!).clientMessageId).toBe(clientMessageId);
  });

  it("re-uploads cached blob with new attachment id when server copy is gone", async () => {
    let now = 20_000;
    const bobUser = crypto.randomUUID();
    const bobDevice = crypto.randomUUID();
    const aliceUser = crypto.randomUUID();
    const aliceDevice = crypto.randomUUID();
    const conversationId = crypto.randomUUID();
    const clientMessageId = crypto.randomUUID();
    const oldAttachmentId = crypto.randomUUID();
    const newAttachmentId = crypto.randomUUID();
    const size = 32;
    const key = generateMediaKey();
    const noncePrefix = generateNoncePrefix();
    const plain = new Uint8Array(size).map((_, i) => i + 1);
    const oldCipher = encryptChunk({
      key,
      noncePrefix,
      attachmentId: oldAttachmentId,
      chunkIndex: 0,
      chunkCount: 1,
      plaintextSize: size,
      plaintext: plain,
    });
    const descriptor: MediaPayload = {
      v: 1,
      t: "media",
      kind: "voice",
      attachmentId: oldAttachmentId,
      algorithm: MEDIA_ALGORITHM,
      size,
      chunkSize: size,
      chunkCount: 1,
      mimeType: "audio/mp4",
      key: encodeMediaKey(key),
      noncePrefix: encodeNoncePrefix(noncePrefix),
      clientMessageId,
    };

    const cache = new MemoryMediaBlobCache();
    await cache.put(clientMessageId, packCipherChunks([oldCipher]), now);
    const outbox = new MemoryOutboxStore();
    await outbox.upsertPending({
      clientMessageId,
      localMessageId: crypto.randomUUID(),
      conversationId,
      peerUserId: aliceUser,
      peerDeviceId: aliceDevice,
      plaintext: serializeMediaPayload(descriptor),
      payloadKind: "media",
      mediaAttachmentId: oldAttachmentId,
      mediaBlobCached: true,
      createdAt: now,
      expiresAt: now + OUTBOX_TTL_MS,
    });

    const posted: MediaPayload[] = [];
    const identity = new MemoryIdentityStore();
    identity.local = {
      userId: bobUser,
      deviceId: bobDevice,
      username: "bob",
      registrationId: 1,
      identityKeyPublic: new Uint8Array(32),
    };
    const conversations = new MemoryConversationStore();
    conversations.conversations.set(conversationId, {
      id: conversationId,
      peerUserId: aliceUser,
      peerUsername: "alice",
      peerDeviceId: aliceDevice,
      lastMessagePreview: "",
      lastMessageAt: 0,
      unreadCount: 0,
    });

    const sync = new SyncService(
      {
        abortBackground: async () => undefined,
        send: async () => ({ envelopeId: crypto.randomUUID() }),
      } as never,
      {
        runWithTransportPaused: async <T>(fn: () => Promise<T>) => fn(),
        setPreKeysLowHandler: () => undefined,
        setSessionResetHandler: () => undefined,
        setEnvelopeHandler: () => undefined,
        setConnectionHandler: () => undefined,
      } as never,
      {
        encryptOutgoing: async (_u: string, _d: string, plaintext: string) => {
          posted.push(JSON.parse(plaintext));
          return {
            recipientUserId: aliceUser,
            recipientDeviceId: aliceDevice,
            messageType: 2,
            ciphertextBase64: Buffer.from(plaintext).toString("base64"),
          };
        },
        replenishLocalPreKeysIfNeeded: async () => undefined,
      } as never,
      new MemoryMessageStore(),
      conversations,
      identity,
      { getAccessToken: async () => "tok" } as never,
      new MemoryReactionStore(),
      null,
      {
        quarantineStore: new MemoryEnvelopeQuarantineStore(),
        attemptStore: new MemoryEnvelopeAttemptStore(),
        sessionResetApi: { request: async () => undefined } as never,
        sessionStore: new MemorySessionStore(),
        outboxStore: outbox,
        clock: () => now,
        mediaBlobCache: cache,
        attachmentExists: async () => false,
        reuploadMediaBlob: async ({ descriptor: d }) => ({
          ...d,
          attachmentId: newAttachmentId,
          clientMessageId,
        }),
      },
    );

    await sync.handleSessionResetRequested(aliceDevice);
    expect(posted).toHaveLength(1);
    expect(posted[0]!.attachmentId).toBe(newAttachmentId);
    expect(posted[0]!.clientMessageId).toBe(clientMessageId);
    const entry = await outbox.get(clientMessageId);
    expect(entry?.mediaAttachmentId).toBe(newAttachmentId);
  });

  it("falls back to descriptor-only when blob over cap / missing", async () => {
    let now = 30_000;
    const bobUser = crypto.randomUUID();
    const bobDevice = crypto.randomUUID();
    const aliceUser = crypto.randomUUID();
    const aliceDevice = crypto.randomUUID();
    const conversationId = crypto.randomUUID();
    const clientMessageId = crypto.randomUUID();
    const attachmentId = crypto.randomUUID();
    const descriptor = makeDescriptor(attachmentId, clientMessageId);

    const outbox = new MemoryOutboxStore();
    await outbox.upsertPending({
      clientMessageId,
      localMessageId: crypto.randomUUID(),
      conversationId,
      peerUserId: aliceUser,
      peerDeviceId: aliceDevice,
      plaintext: serializeMediaPayload(descriptor),
      payloadKind: "media",
      mediaAttachmentId: attachmentId,
      mediaBlobCached: false,
      createdAt: now,
      expiresAt: now + OUTBOX_TTL_MS,
    });

    const posted: string[] = [];
    const identity = new MemoryIdentityStore();
    identity.local = {
      userId: bobUser,
      deviceId: bobDevice,
      username: "bob",
      registrationId: 1,
      identityKeyPublic: new Uint8Array(32),
    };
    const conversations = new MemoryConversationStore();
    conversations.conversations.set(conversationId, {
      id: conversationId,
      peerUserId: aliceUser,
      peerUsername: "alice",
      peerDeviceId: aliceDevice,
      lastMessagePreview: "",
      lastMessageAt: 0,
      unreadCount: 0,
    });

    const sync = new SyncService(
      {
        abortBackground: async () => undefined,
        send: async () => ({ envelopeId: crypto.randomUUID() }),
      } as never,
      {
        runWithTransportPaused: async <T>(fn: () => Promise<T>) => fn(),
        setPreKeysLowHandler: () => undefined,
        setSessionResetHandler: () => undefined,
        setEnvelopeHandler: () => undefined,
        setConnectionHandler: () => undefined,
      } as never,
      {
        encryptOutgoing: async (_u: string, _d: string, plaintext: string) => {
          posted.push(plaintext);
          return {
            recipientUserId: aliceUser,
            recipientDeviceId: aliceDevice,
            messageType: 2,
            ciphertextBase64: Buffer.from(plaintext).toString("base64"),
          };
        },
        replenishLocalPreKeysIfNeeded: async () => undefined,
      } as never,
      new MemoryMessageStore(),
      conversations,
      identity,
      { getAccessToken: async () => "tok" } as never,
      new MemoryReactionStore(),
      null,
      {
        quarantineStore: new MemoryEnvelopeQuarantineStore(),
        attemptStore: new MemoryEnvelopeAttemptStore(),
        sessionResetApi: { request: async () => undefined } as never,
        sessionStore: new MemorySessionStore(),
        outboxStore: outbox,
        clock: () => now,
        mediaBlobCache: new MemoryMediaBlobCache(),
        attachmentExists: async () => false,
      },
    );

    await sync.handleSessionResetRequested(aliceDevice);
    expect(posted).toHaveLength(1);
    expect(JSON.parse(posted[0]!).attachmentId).toBe(attachmentId);
  });
});

describe("Media resend E2E dedupe on receiver", () => {
  it("ingestIncomingMedia dedupes by clientMessageId", async () => {
    const clientMessageId = crypto.randomUUID();
    const attachmentId = crypto.randomUUID();
    const descriptor = makeDescriptor(attachmentId, clientMessageId);
    const messages = new MemoryMessageStore();
    const attachments = new MemoryAttachmentStore();
    const conversations = new MemoryConversationStore();
    const conversationId = crypto.randomUUID();
    const peerUser = crypto.randomUUID();
    const peerDevice = crypto.randomUUID();
    conversations.conversations.set(conversationId, {
      id: conversationId,
      peerUserId: peerUser,
      peerUsername: "p",
      peerDeviceId: peerDevice,
      lastMessagePreview: "",
      lastMessageAt: 0,
      unreadCount: 0,
    });

    const transfer = new MediaTransferService(
      {
        getStatus: async () => ({
          sizeBytes: descriptor.size,
          chunkSizeBytes: descriptor.chunkSize,
          chunkCount: descriptor.chunkCount,
          uploadedChunks: [0],
        }),
      } as never,
      messages,
      attachments,
      conversations,
      new MemoryIdentityStore(),
      async () => ({ envelopeId: crypto.randomUUID() }),
    );

    const conversation = (await conversations.getById(conversationId))!;
    await transfer.ingestIncomingMedia({
      conversation,
      payload: descriptor,
      senderDeviceId: peerDevice,
      serverEnvelopeId: crypto.randomUUID(),
      createdAt: 1,
      messageType: 2,
    });
    await transfer.ingestIncomingMedia({
      conversation,
      payload: descriptor,
      senderDeviceId: peerDevice,
      serverEnvelopeId: crypto.randomUUID(),
      createdAt: 2,
      messageType: 2,
    });
    const all = await messages.listByConversation(conversationId, 50);
    expect(all).toHaveLength(1);
    expect(all[0]?.clientId).toBe(clientMessageId);
  });
});
