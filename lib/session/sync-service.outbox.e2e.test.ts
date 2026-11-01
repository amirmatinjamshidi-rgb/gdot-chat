import { describe, expect, it } from "vitest";

import { MemoryOutboxStore } from "@/lib/db/outbox-store";
import {
  MemoryConversationStore,
  MemoryIdentityStore,
  MemoryMessageStore,
  MemoryReactionStore,
  MemorySessionStore,
} from "@/lib/test/memory-stores";
import { MemoryEnvelopeAttemptStore } from "@/lib/db/envelope-attempt-store";
import { MemoryEnvelopeQuarantineStore } from "@/lib/db/envelope-quarantine-store";
import { OUTBOX_TTL_MS } from "@/lib/session/outbox-constants";
import { SyncService } from "@/lib/session/sync-service";
import { InboundEnvelopeProcessor } from "@/lib/session/inbound/inbound-envelope-processor";
import {
  parseSignalPlaintext,
  serializeReceiptPayload,
} from "@/lib/protocol/payload";
import { bytesToBase64 } from "@/lib/crypto/encoding";
import { MemorySessionResetCooldownStore } from "@/lib/db/envelope-attempt-store";

/**
 * End-to-end: Bob sends → session reset → resend → Alice decrypts/dedupes/receipts → Bob marks delivered.
 */
describe("SyncService outbox E2E (session reset resend + receipts)", () => {
  it("resends after reset and clears outbox when receipt arrives", async () => {
    let now = 11_000_000;
    const clock = () => now;

    const bobUser = crypto.randomUUID();
    const bobDevice = crypto.randomUUID();
    const aliceUser = crypto.randomUUID();
    const aliceDevice = crypto.randomUUID();
    const conversationId = crypto.randomUUID();

    const bobMessages = new MemoryMessageStore();
    const bobConversations = new MemoryConversationStore();
    const bobIdentity = new MemoryIdentityStore();
    const bobSessions = new MemorySessionStore();
    const bobOutbox = new MemoryOutboxStore();
    const bobSentCipher: string[] = [];

    bobIdentity.local = {
      userId: bobUser,
      deviceId: bobDevice,
      username: "bob",
      registrationId: 1,
      identityKeyPublic: new Uint8Array(32),
    };
    bobConversations.conversations.set(conversationId, {
      id: conversationId,
      peerUserId: aliceUser,
      peerUsername: "alice",
      peerDeviceId: aliceDevice,
      lastMessagePreview: "",
      lastMessageAt: 0,
      unreadCount: 0,
    });

    const bobSync = new SyncService(
      {
        abortBackground: async () => undefined,
        send: async () => {
          return { envelopeId: crypto.randomUUID() };
        },
      } as never,
      {
        runWithTransportPaused: async <T>(fn: () => Promise<T>) => fn(),
        setPreKeysLowHandler: () => undefined,
        setSessionResetHandler: () => undefined,
        setEnvelopeHandler: () => undefined,
        setConnectionHandler: () => undefined,
      } as never,
      {
        encryptOutgoing: async (
          _u: string,
          _d: string,
          plaintext: string,
        ) => {
          bobSentCipher.push(plaintext);
          return {
            recipientUserId: aliceUser,
            recipientDeviceId: aliceDevice,
            messageType: 2,
            ciphertextBase64: Buffer.from(plaintext).toString("base64"),
          };
        },
        replenishLocalPreKeysIfNeeded: async () => undefined,
      } as never,
      bobMessages,
      bobConversations,
      bobIdentity,
      {
        getAccessToken: async () => "tok",
        clearSessionExpired: async () => undefined,
      } as never,
      new MemoryReactionStore(),
      null,
      {
        quarantineStore: new MemoryEnvelopeQuarantineStore(),
        attemptStore: new MemoryEnvelopeAttemptStore(),
        sessionResetApi: { request: async () => undefined } as never,
        sessionStore: bobSessions,
        outboxStore: bobOutbox,
        clock,
      },
    );

    const body = `e2e-${crypto.randomUUID()}`;
    await bobSync.sendOutgoing(conversationId, body);
    expect(bobSentCipher).toHaveLength(1);
    expect(await bobOutbox.listPendingForPeerDevice(aliceDevice, now)).toHaveLength(
      1,
    );

    await bobSync.handleSessionResetRequested(aliceDevice);
    expect(bobSentCipher.length).toBe(2);

    const resent = bobSentCipher[1]!;
    const parsed = parseSignalPlaintext(resent);
    expect(parsed.kind).toBe("text");
    if (parsed.kind !== "text") throw new Error("expected text");
    const clientMessageId = parsed.payload.clientMessageId!;
    expect(clientMessageId).toBeTruthy();

    // Alice receives both original+resend (simulated as two envelopes with same payload)
    const aliceMessages = new MemoryMessageStore();
    const aliceConversations = new MemoryConversationStore();
    const aliceReceipts: string[] = [];
    aliceConversations.conversations.set(conversationId, {
      id: conversationId,
      peerUserId: bobUser,
      peerUsername: "bob",
      peerDeviceId: bobDevice,
      lastMessagePreview: "",
      lastMessageAt: 0,
      unreadCount: 0,
    });

    const aliceProcessor = new InboundEnvelopeProcessor({
      messagesApi: { ack: async () => undefined } as never,
      signalService: {
        decryptIncoming: async () => resent,
        getIdentityTrust: async () => ({
          keyChanged: false,
          verified: false,
          hasRemote: true,
        }),
      } as never,
      messageStore: aliceMessages,
      conversationStore: aliceConversations,
      reactionStore: new MemoryReactionStore(),
      quarantineStore: new MemoryEnvelopeQuarantineStore(),
      attemptStore: new MemoryEnvelopeAttemptStore(),
      sessionResetApi: { request: async () => undefined } as never,
      sessionResetCooldown: new MemorySessionResetCooldownStore(),
      mediaTransfer: null,
      sendEncrypted: async (_c, p: string) => {
        aliceReceipts.push(p);
      },
      isDbReady: () => true,
      clock,
    });

    const env = () => ({
      id: crypto.randomUUID(),
      senderDeviceId: bobDevice,
      senderUserId: bobUser,
      messageType: 2 as const,
      ciphertextBase64: bytesToBase64(new Uint8Array([3])),
      createdAt: new Date(now).toISOString(),
    });
    await aliceProcessor.processEnvelope(env());
    await aliceProcessor.processEnvelope(env());
    expect(await aliceMessages.listByConversation(conversationId, 20)).toHaveLength(
      1,
    );
    expect(aliceReceipts).toHaveLength(2);

    // Bob inbound receipt
    const bobInbound = new InboundEnvelopeProcessor({
      messagesApi: { ack: async () => undefined } as never,
      signalService: {
        decryptIncoming: async () => aliceReceipts[0]!,
        getIdentityTrust: async () => ({
          keyChanged: false,
          verified: false,
          hasRemote: true,
        }),
      } as never,
      messageStore: bobMessages,
      conversationStore: bobConversations,
      reactionStore: new MemoryReactionStore(),
      quarantineStore: new MemoryEnvelopeQuarantineStore(),
      attemptStore: new MemoryEnvelopeAttemptStore(),
      sessionResetApi: { request: async () => undefined } as never,
      sessionResetCooldown: new MemorySessionResetCooldownStore(),
      mediaTransfer: null,
      outboxStore: bobOutbox,
      isDbReady: () => true,
      clock,
    });
    await bobInbound.processEnvelope({
      id: crypto.randomUUID(),
      senderDeviceId: aliceDevice,
      senderUserId: aliceUser,
      messageType: 2,
      ciphertextBase64: bytesToBase64(new Uint8Array([4])),
      createdAt: new Date(now).toISOString(),
    });

    const bobLocal = await bobMessages.getByClientId(clientMessageId);
    expect(bobLocal?.status).toBe("delivered");
    expect(await bobOutbox.get(clientMessageId)).toBeNull();
    // TTL still sane
    expect(OUTBOX_TTL_MS).toBeGreaterThan(0);
    expect(serializeReceiptPayload([clientMessageId])).toContain("receipt");
  });
});
