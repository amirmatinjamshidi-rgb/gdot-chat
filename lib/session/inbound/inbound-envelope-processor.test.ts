import { describe, expect, it, vi } from "vitest";

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
  ENVELOPE_MAX_ATTEMPTS,
  UNDISPLAYABLE_MESSAGE_PLACEHOLDER,
} from "@/lib/session/inbound/constants";

import { InboundEnvelopeProcessor } from "./inbound-envelope-processor";

function fakeClock(start = 1_000_000) {
  let now = start;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

function makeProcessor(opts?: {
  decrypt?: (userId: string, type: 2 | 3, ct: Uint8Array) => Promise<string>;
  keyChanged?: boolean;
  mediaTransfer?: unknown;
}) {
  const clock = fakeClock();
  const messageStore = new MemoryMessageStore();
  const conversationStore = new MemoryConversationStore();
  const quarantineStore = new MemoryEnvelopeQuarantineStore();
  const attemptStore = new MemoryEnvelopeAttemptStore();
  const acked: string[] = [];
  const resets: string[] = [];
  const logs: { envelopeId: string; errorClass: string; errorName: string }[] =
    [];

  const peerUserId = crypto.randomUUID();
  const peerDeviceId = crypto.randomUUID();
  const conversationId = crypto.randomUUID();

  const processor = new InboundEnvelopeProcessor({
    messagesApi: {
      ack: async (id: string) => {
        acked.push(id);
      },
    } as never,
    signalService: {
      decryptIncoming:
        opts?.decrypt ??
        (async () => {
          throw new Error("Bad MAC");
        }),
      getIdentityTrust: async () => ({
        keyChanged: opts?.keyChanged ?? false,
        verified: false,
        hasRemote: true,
      }),
    } as never,
    messageStore,
    conversationStore,
    reactionStore: new MemoryReactionStore(),
    quarantineStore,
    attemptStore,
    sessionResetApi: {
      request: async (targetDeviceId: string) => {
        resets.push(targetDeviceId);
      },
    } as never,
    sessionResetCooldown: new MemorySessionResetCooldownStore(),
    mediaTransfer: (opts?.mediaTransfer as never) ?? null,
    isDbReady: () => true,
    clock: () => clock.now(),
    logFailure: (e) => logs.push(e),
  });

  return {
    processor,
    clock,
    messageStore,
    conversationStore,
    quarantineStore,
    attemptStore,
    acked,
    resets,
    logs,
    peerUserId,
    peerDeviceId,
    conversationId,
    async seedConversation() {
      await conversationStore.upsert({
        id: conversationId,
        peerUserId,
        peerUsername: `u_${peerUserId.slice(0, 8)}`,
        peerDeviceId,
        lastMessagePreview: "",
        lastMessageAt: 0,
        unreadCount: 0,
      });
    },
  };
}

describe("InboundEnvelopeProcessor (unit)", () => {
  it("acks and placeholders permanent decrypt failures", async () => {
    const ctx = makeProcessor({
      decrypt: async () => {
        throw new Error("Duplicate message");
      },
    });
    await ctx.seedConversation();
    const envelopeId = crypto.randomUUID();
    await ctx.processor.processEnvelope({
      id: envelopeId,
      senderDeviceId: ctx.peerDeviceId,
      senderUserId: ctx.peerUserId,
      messageType: 2,
      ciphertextBase64: bytesToBase64(new Uint8Array([1, 2, 3])),
      createdAt: new Date(ctx.clock.now()).toISOString(),
    });
    expect(ctx.acked).toEqual([envelopeId]);
    const msgs = [...ctx.messageStore.messages.values()];
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.plaintext).toBe(UNDISPLAYABLE_MESSAGE_PLACEHOLDER);
    expect(ctx.logs[0]?.errorClass).toBe("permanent");
  });

  it("does not ack transient failures until attempts exhausted", async () => {
    const ctx = makeProcessor({
      decrypt: async () => {
        throw new Error("database is locked");
      },
    });
    await ctx.seedConversation();
    const envelopeId = crypto.randomUUID();
    const env = {
      id: envelopeId,
      senderDeviceId: ctx.peerDeviceId,
      senderUserId: ctx.peerUserId,
      messageType: 2 as const,
      ciphertextBase64: bytesToBase64(new Uint8Array([9])),
      createdAt: new Date(ctx.clock.now()).toISOString(),
    };
    for (let i = 0; i < ENVELOPE_MAX_ATTEMPTS - 1; i++) {
      await ctx.processor.processEnvelope(env);
      expect(ctx.acked).toEqual([]);
    }
    await ctx.processor.processEnvelope(env);
    expect(ctx.acked).toEqual([envelopeId]);
    expect(
      [...ctx.messageStore.messages.values()][0]!.plaintext,
    ).toBe(UNDISPLAYABLE_MESSAGE_PLACEHOLDER);
  });

  it("quarantines needs_user failures and acks server", async () => {
    const ctx = makeProcessor({
      keyChanged: true,
      decrypt: async () => {
        throw new Error("Bad MAC");
      },
    });
    await ctx.seedConversation();
    const envelopeId = crypto.randomUUID();
    await ctx.processor.processEnvelope({
      id: envelopeId,
      senderDeviceId: ctx.peerDeviceId,
      senderUserId: ctx.peerUserId,
      messageType: 3,
      ciphertextBase64: bytesToBase64(new Uint8Array([4, 5])),
      createdAt: new Date(ctx.clock.now()).toISOString(),
    });
    expect(ctx.acked).toEqual([envelopeId]);
    const q = await ctx.quarantineStore.listPendingIdentityForPeer(ctx.peerUserId);
    expect(q).toHaveLength(1);
    expect(q[0]!.kind).toBe("identity_key");
    expect(ctx.messageStore.messages.size).toBe(0);
  });

  it("quarantines unknown sender as message_request and acks", async () => {
    const ctx = makeProcessor();
    const envelopeId = crypto.randomUUID();
    const senderDeviceId = crypto.randomUUID();
    const senderUserId = crypto.randomUUID();
    await ctx.processor.processEnvelope({
      id: envelopeId,
      senderDeviceId,
      senderUserId,
      messageType: 2,
      ciphertextBase64: bytesToBase64(new Uint8Array([7])),
      createdAt: new Date(ctx.clock.now()).toISOString(),
    });
    expect(ctx.acked).toEqual([envelopeId]);
    const reqs = await ctx.processor.listMessageRequests();
    expect(reqs).toHaveLength(1);
    expect(reqs[0]!.kind).toBe("message_request");
  });

  it("acks invalid structured media descriptor with placeholder", async () => {
    const bad = JSON.stringify({
      v: 1,
      t: "media",
      kind: "voice",
      attachmentId: "short",
    });
    const ctx = makeProcessor({
      decrypt: async () => bad,
    });
    await ctx.seedConversation();
    const envelopeId = crypto.randomUUID();
    await ctx.processor.processEnvelope({
      id: envelopeId,
      senderDeviceId: ctx.peerDeviceId,
      senderUserId: ctx.peerUserId,
      messageType: 2,
      ciphertextBase64: bytesToBase64(new Uint8Array([1])),
      createdAt: new Date(ctx.clock.now()).toISOString(),
    });
    expect(ctx.acked).toEqual([envelopeId]);
    expect(
      [...ctx.messageStore.messages.values()][0]!.plaintext,
    ).toBe(UNDISPLAYABLE_MESSAGE_PLACEHOLDER);
  });

  it("isolates ingestIncomingMedia failures without aborting later work", async () => {
    const { encodeMediaKey, encodeNoncePrefix, MEDIA_ALGORITHM } = await import(
      "@/lib/protocol/payload"
    );
    const ingest = vi.fn(async () => {
      throw new Error("chunk missing");
    });
    let calls = 0;
    const ctx = makeProcessor({
      decrypt: async () => {
        calls++;
        if (calls === 1) {
          return JSON.stringify({
            v: 1,
            t: "media",
            kind: "voice",
            attachmentId: "11111111-1111-1111-1111-111111111111",
            algorithm: MEDIA_ALGORITHM,
            size: 10,
            chunkSize: 4 * 1024 * 1024,
            chunkCount: 1,
            mimeType: "audio/mp4",
            key: encodeMediaKey(new Uint8Array(32).fill(1)),
            noncePrefix: encodeNoncePrefix(new Uint8Array(8).fill(2)),
          });
        }
        return JSON.stringify({ v: 1, t: "text", text: "second" });
      },
      mediaTransfer: {
        ingestIncomingMedia: ingest,
        downloadAttachment: vi.fn(),
      },
    });
    await ctx.seedConversation();

    const e1 = crypto.randomUUID();
    const e2 = crypto.randomUUID();
    await ctx.processor.processEnvelope({
      id: e1,
      senderDeviceId: ctx.peerDeviceId,
      senderUserId: ctx.peerUserId,
      messageType: 2,
      ciphertextBase64: bytesToBase64(new Uint8Array([1])),
      createdAt: new Date(ctx.clock.now()).toISOString(),
    });
    await ctx.processor.processEnvelope({
      id: e2,
      senderDeviceId: ctx.peerDeviceId,
      senderUserId: ctx.peerUserId,
      messageType: 2,
      ciphertextBase64: bytesToBase64(new Uint8Array([2])),
      createdAt: new Date(ctx.clock.now()).toISOString(),
    });
    expect(ingest).toHaveBeenCalled();
    const texts = [...ctx.messageStore.messages.values()].map((m) => m.plaintext);
    expect(texts).toContain("second");
  });

  it("requests session reset once for missing session (cooldown)", async () => {
    const ctx = makeProcessor({
      decrypt: async () => {
        throw new Error("No valid sessions");
      },
    });
    await ctx.seedConversation();
    const e1 = crypto.randomUUID();
    const e2 = crypto.randomUUID();
    const base = {
      senderDeviceId: ctx.peerDeviceId,
      senderUserId: ctx.peerUserId,
      messageType: 2 as const,
      ciphertextBase64: bytesToBase64(new Uint8Array([1])),
      createdAt: new Date(ctx.clock.now()).toISOString(),
    };
    await ctx.processor.processEnvelope({ ...base, id: e1 });
    await ctx.processor.processEnvelope({ ...base, id: e2 });
    expect(ctx.resets).toEqual([ctx.peerDeviceId]);
  });

  it("pauses when db not ready (no ack)", async () => {
    const ctx = makeProcessor();
    await ctx.seedConversation();
    (ctx.processor as unknown as { deps: { isDbReady: () => boolean } }).deps.isDbReady =
      () => false;
    const envelopeId = crypto.randomUUID();
    await ctx.processor.processEnvelope({
      id: envelopeId,
      senderDeviceId: ctx.peerDeviceId,
      senderUserId: ctx.peerUserId,
      messageType: 2,
      ciphertextBase64: bytesToBase64(new Uint8Array([1])),
      createdAt: new Date(ctx.clock.now()).toISOString(),
    });
    expect(ctx.acked).toEqual([]);
  });
});
