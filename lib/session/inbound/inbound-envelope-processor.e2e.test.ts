import { describe, expect, it } from "vitest";

import { bytesToBase64 } from "@/lib/crypto/encoding";
import {
  MemoryConversationStore,
  MemoryMessageStore,
  MemoryReactionStore,
} from "@/lib/test/memory-stores";
import {
  MemoryEnvelopeAttemptStore,
  MemorySessionResetCooldownStore,
} from "@/lib/db/envelope-attempt-store";
import { MemoryEnvelopeQuarantineStore } from "@/lib/db/envelope-quarantine-store";
import {
  ENVELOPE_MAX_ATTEMPT_AGE_MS,
  MESSAGE_REQUEST_TTL_MS,
  UNDISPLAYABLE_MESSAGE_PLACEHOLDER,
} from "@/lib/session/inbound/constants";
import {
  encodeMediaKey,
  encodeNoncePrefix,
  MEDIA_ALGORITHM,
  serializeTextPayload,
} from "@/lib/protocol/payload";

import { InboundEnvelopeProcessor } from "./inbound-envelope-processor";

/**
 * E2E-style flows with random users/devices and an injected clock (no sleeps).
 */
describe("InboundEnvelopeProcessor (E2E flows)", () => {
  function setup() {
    let now = 5_000_000;
    const clock = {
      now: () => now,
      advance: (ms: number) => {
        now += ms;
      },
    };
    const messageStore = new MemoryMessageStore();
    const conversationStore = new MemoryConversationStore();
    const quarantineStore = new MemoryEnvelopeQuarantineStore();
    const attemptStore = new MemoryEnvelopeAttemptStore();
    const acked: string[] = [];
    let plaintext: string | Error = serializeTextPayload("hello-e2e");

    const aliceUser = crypto.randomUUID();
    const aliceDevice = crypto.randomUUID();
    const bobUser = crypto.randomUUID();
    const bobDevice = crypto.randomUUID();

    const processor = new InboundEnvelopeProcessor({
      messagesApi: {
        ack: async (id: string) => {
          acked.push(id);
        },
      } as never,
      signalService: {
        decryptIncoming: async () => {
          if (plaintext instanceof Error) throw plaintext;
          return plaintext;
        },
        getIdentityTrust: async () => ({
          keyChanged: false,
          verified: false,
          hasRemote: true,
        }),
      } as never,
      messageStore,
      conversationStore,
      reactionStore: new MemoryReactionStore(),
      quarantineStore,
      attemptStore,
      sessionResetApi: { request: async () => undefined } as never,
      sessionResetCooldown: new MemorySessionResetCooldownStore(),
      mediaTransfer: null,
      isDbReady: () => true,
      clock: () => clock.now(),
      resolveUsername: async (userId: string) =>
        userId === aliceUser ? `alice_${aliceUser.slice(0, 6)}` : null,
    });

    return {
      clock,
      processor,
      messageStore,
      conversationStore,
      quarantineStore,
      attemptStore,
      acked,
      setPlaintext: (v: string | Error) => {
        plaintext = v;
      },
      aliceUser,
      aliceDevice,
      bobUser,
      bobDevice,
    };
  }

  it("accepts a message request: creates conversation and decrypts", async () => {
    const ctx = setup();
    const envelopeId = crypto.randomUUID();
    ctx.setPlaintext(serializeTextPayload(`hi-${envelopeId}`));

    await ctx.processor.processEnvelope({
      id: envelopeId,
      senderDeviceId: ctx.aliceDevice,
      senderUserId: ctx.aliceUser,
      messageType: 3,
      ciphertextBase64: bytesToBase64(new Uint8Array([11, 22])),
      createdAt: new Date(ctx.clock.now()).toISOString(),
    });

    expect(ctx.acked).toEqual([envelopeId]);
    const reqs = await ctx.processor.listMessageRequests();
    expect(reqs).toHaveLength(1);

    await ctx.processor.acceptMessageRequest(reqs[0]!.id);
    const conv = await ctx.conversationStore.getByPeer(ctx.aliceUser);
    expect(conv).not.toBeNull();
    expect(conv!.peerDeviceId).toBe(ctx.aliceDevice);
    const msgs = [...ctx.messageStore.messages.values()];
    expect(msgs.some((m) => m.plaintext === `hi-${envelopeId}`)).toBe(true);
    expect(await ctx.processor.listMessageRequests()).toHaveLength(0);
  });

  it("rejects a message request and drops ciphertext", async () => {
    const ctx = setup();
    const envelopeId = crypto.randomUUID();
    await ctx.processor.processEnvelope({
      id: envelopeId,
      senderDeviceId: ctx.aliceDevice,
      senderUserId: ctx.aliceUser,
      messageType: 2,
      ciphertextBase64: bytesToBase64(new Uint8Array([3])),
      createdAt: new Date(ctx.clock.now()).toISOString(),
    });
    const reqs = await ctx.processor.listMessageRequests();
    await ctx.processor.rejectMessageRequest(reqs[0]!.id);
    expect(await ctx.processor.listMessageRequests()).toHaveLength(0);
    const row = await ctx.quarantineStore.getByServerEnvelopeId(envelopeId);
    expect(row?.status).toBe("rejected");
    expect(row?.ciphertext.length).toBe(0);
  });

  it("expires message requests after 7 days (injected clock)", async () => {
    const ctx = setup();
    const envelopeId = crypto.randomUUID();
    await ctx.processor.processEnvelope({
      id: envelopeId,
      senderDeviceId: ctx.aliceDevice,
      senderUserId: ctx.aliceUser,
      messageType: 2,
      ciphertextBase64: bytesToBase64(new Uint8Array([3])),
      createdAt: new Date(ctx.clock.now()).toISOString(),
    });
    expect(await ctx.processor.listMessageRequests()).toHaveLength(1);
    ctx.clock.advance(MESSAGE_REQUEST_TTL_MS + 1);
    await ctx.processor.expireStaleMessageRequests();
    expect(await ctx.processor.listMessageRequests()).toHaveLength(0);
  });

  it("promotes transient to permanent after 24h age (injected clock)", async () => {
    const ctx = setup();
    await ctx.conversationStore.upsert({
      id: crypto.randomUUID(),
      peerUserId: ctx.aliceUser,
      peerUsername: "alice",
      peerDeviceId: ctx.aliceDevice,
      lastMessagePreview: "",
      lastMessageAt: 0,
      unreadCount: 0,
    });
    ctx.setPlaintext(new Error("database is locked"));
    const envelopeId = crypto.randomUUID();
    const env = {
      id: envelopeId,
      senderDeviceId: ctx.aliceDevice,
      senderUserId: ctx.aliceUser,
      messageType: 2 as const,
      ciphertextBase64: bytesToBase64(new Uint8Array([1])),
      createdAt: new Date(ctx.clock.now()).toISOString(),
    };
    await ctx.processor.processEnvelope(env);
    expect(ctx.acked).toEqual([]);
    ctx.clock.advance(ENVELOPE_MAX_ATTEMPT_AGE_MS + 1);
    await ctx.processor.processEnvelope(env);
    expect(ctx.acked).toEqual([envelopeId]);
    expect(
      [...ctx.messageStore.messages.values()][0]!.plaintext,
    ).toBe(UNDISPLAYABLE_MESSAGE_PLACEHOLDER);
  });

  it("retries identity quarantine after accept path", async () => {
    const ctx = setup();
    const convId = crypto.randomUUID();
    await ctx.conversationStore.upsert({
      id: convId,
      peerUserId: ctx.aliceUser,
      peerUsername: "alice",
      peerDeviceId: ctx.aliceDevice,
      lastMessagePreview: "",
      lastMessageAt: 0,
      unreadCount: 0,
    });

    // First: needs_user quarantine
    (ctx.processor as unknown as {
      deps: { signalService: { getIdentityTrust: () => Promise<unknown> } };
    }).deps.signalService.getIdentityTrust = async () => ({
      keyChanged: true,
      verified: false,
      hasRemote: true,
    });
    ctx.setPlaintext(new Error("Bad MAC"));
    const envelopeId = crypto.randomUUID();
    await ctx.processor.processEnvelope({
      id: envelopeId,
      senderDeviceId: ctx.aliceDevice,
      senderUserId: ctx.aliceUser,
      messageType: 3,
      ciphertextBase64: bytesToBase64(new Uint8Array([9])),
      createdAt: new Date(ctx.clock.now()).toISOString(),
    });
    expect(ctx.acked).toEqual([envelopeId]);

    // User accepts key: trust clear + decrypt works
    (ctx.processor as unknown as {
      deps: { signalService: { getIdentityTrust: () => Promise<unknown> } };
    }).deps.signalService.getIdentityTrust = async () => ({
      keyChanged: false,
      verified: true,
      hasRemote: true,
    });
    ctx.setPlaintext(serializeTextPayload("after-accept"));
    await ctx.processor.retryIdentityQuarantine(ctx.aliceUser);
    expect(
      [...ctx.messageStore.messages.values()].some(
        (m) => m.plaintext === "after-accept",
      ),
    ).toBe(true);
  });

  it("does not render invalid media descriptor as raw JSON", async () => {
    const ctx = setup();
    await ctx.conversationStore.upsert({
      id: crypto.randomUUID(),
      peerUserId: ctx.aliceUser,
      peerUsername: "alice",
      peerDeviceId: ctx.aliceDevice,
      lastMessagePreview: "",
      lastMessageAt: 0,
      unreadCount: 0,
    });
    const key = encodeMediaKey(new Uint8Array(32).fill(1));
    const nonce = encodeNoncePrefix(new Uint8Array(8).fill(2));
    // Wrong chunkCount → parse fails → invalid structured
    ctx.setPlaintext(
      JSON.stringify({
        v: 1,
        t: "media",
        kind: "voice",
        attachmentId: crypto.randomUUID(),
        algorithm: MEDIA_ALGORITHM,
        size: 10,
        chunkSize: 4,
        chunkCount: 99,
        mimeType: "audio/mp4",
        key,
        noncePrefix: nonce,
      }),
    );
    const envelopeId = crypto.randomUUID();
    await ctx.processor.processEnvelope({
      id: envelopeId,
      senderDeviceId: ctx.aliceDevice,
      senderUserId: ctx.aliceUser,
      messageType: 2,
      ciphertextBase64: bytesToBase64(new Uint8Array([1])),
      createdAt: new Date(ctx.clock.now()).toISOString(),
    });
    const msg = [...ctx.messageStore.messages.values()][0]!;
    expect(msg.plaintext).toBe(UNDISPLAYABLE_MESSAGE_PLACEHOLDER);
    expect(msg.plaintext.includes('"t":"media"')).toBe(false);
  });
});
