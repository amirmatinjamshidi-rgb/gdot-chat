import { describe, expect, it } from "vitest";

import { bytesToBase64 } from "@/lib/crypto/encoding";
import { DbLockedError } from "@/lib/db/db-errors";
import {
  MemoryEnvelopeAttemptStore,
  MemorySessionResetCooldownStore,
} from "@/lib/db/envelope-attempt-store";
import { MemoryEnvelopeQuarantineStore } from "@/lib/db/envelope-quarantine-store";
import {
  MemoryConversationStore,
  MemoryMessageStore,
  MemoryReactionStore,
} from "@/lib/test/memory-stores";
import { serializeTextPayload } from "@/lib/protocol/payload";
import { InboundEnvelopeProcessor } from "./inbound-envelope-processor";

describe("Inbound lock mid-envelope → unlock once", () => {
  function setup(opts: {
    decrypt?: () => Promise<string>;
    insertHook?: (orig: MemoryMessageStore["insert"]) => MemoryMessageStore["insert"];
    ackHook?: (id: string, acked: string[]) => Promise<void>;
  }) {
    const messageStore = new MemoryMessageStore();
    if (opts.insertHook) {
      const orig = messageStore.insert.bind(messageStore);
      messageStore.insert = opts.insertHook(orig);
    }
    const conversationStore = new MemoryConversationStore();
    const attemptStore = new MemoryEnvelopeAttemptStore();
    const acked: string[] = [];
    const peerUserId = crypto.randomUUID();
    const peerDeviceId = crypto.randomUUID();
    const conversationId = crypto.randomUUID();
    const clientMessageId = crypto.randomUUID();
    const plaintext = serializeTextPayload(
      `hello_${crypto.randomUUID().slice(0, 6)}`,
      clientMessageId,
    );

    const processor = new InboundEnvelopeProcessor({
      messagesApi: {
        ack: async (id: string) => {
          if (opts.ackHook) {
            await opts.ackHook(id, acked);
            return;
          }
          acked.push(id);
        },
      } as never,
      signalService: {
        decryptIncoming: opts.decrypt ?? (async () => plaintext),
        getIdentityTrust: async () => ({
          keyChanged: false,
          verified: false,
          hasRemote: true,
        }),
      } as never,
      messageStore,
      conversationStore,
      reactionStore: new MemoryReactionStore(),
      quarantineStore: new MemoryEnvelopeQuarantineStore(),
      attemptStore,
      sessionResetApi: { request: async () => undefined } as never,
      sessionResetCooldown: new MemorySessionResetCooldownStore(),
      mediaTransfer: null,
      isDbReady: () => true,
      clock: () => 1_000_000,
    });

    return {
      processor,
      messageStore,
      attemptStore,
      acked,
      peerUserId,
      peerDeviceId,
      conversationId,
      clientMessageId,
      plaintext,
      async seed() {
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
      env(id: string) {
        return {
          id,
          senderDeviceId: peerDeviceId,
          senderUserId: peerUserId,
          messageType: 2 as const,
          ciphertextBase64: bytesToBase64(new Uint8Array([1, 2, 3])),
          createdAt: new Date(1_000_000).toISOString(),
        };
      },
    };
  }

  it("after decrypt, before persist (DB_LOCKED on insert): no ack; unlock delivers once", async () => {
    let inserts = 0;
    const ctx = setup({
      insertHook: (orig) => async (msg) => {
        inserts += 1;
        if (inserts === 1) throw new DbLockedError();
        return orig(msg);
      },
    });
    await ctx.seed();
    const envelopeId = crypto.randomUUID();

    await ctx.processor.processEnvelope(ctx.env(envelopeId));
    expect(ctx.acked).toEqual([]);
    expect([...ctx.messageStore.messages.values()]).toHaveLength(0);
    expect(await ctx.attemptStore.get(envelopeId)).toBeNull();

    await ctx.processor.processEnvelope(ctx.env(envelopeId));
    expect(ctx.acked).toEqual([envelopeId]);
    const msgs = [...ctx.messageStore.messages.values()].filter(
      (m) => m.direction === "incoming",
    );
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.clientId).toBe(ctx.clientMessageId);
  });

  it("after persist, before ack (ack DB_LOCKED): unlock dedupes and acks once locally", async () => {
    let ackCalls = 0;
    const ctx = setup({
      ackHook: async (id, acked) => {
        ackCalls += 1;
        if (ackCalls === 1) throw new DbLockedError();
        acked.push(id);
      },
    });
    await ctx.seed();
    const envelopeId = crypto.randomUUID();

    await ctx.processor.processEnvelope(ctx.env(envelopeId));
    expect(ctx.acked).toEqual([]);
    expect([...ctx.messageStore.messages.values()]).toHaveLength(1);

    await ctx.processor.processEnvelope(ctx.env(envelopeId));
    expect(ctx.acked).toEqual([envelopeId]);
    const msgs = [...ctx.messageStore.messages.values()].filter(
      (m) => m.direction === "incoming",
    );
    expect(msgs).toHaveLength(1);
  });

  it("DB_LOCKED during decrypt does not burn attempts or ack", async () => {
    let decrypts = 0;
    const ctx = setup({
      decrypt: async () => {
        decrypts += 1;
        if (decrypts === 1) throw new DbLockedError();
        return serializeTextPayload("ok", crypto.randomUUID());
      },
    });
    await ctx.seed();
    const envelopeId = crypto.randomUUID();

    await ctx.processor.processEnvelope(ctx.env(envelopeId));
    expect(ctx.acked).toEqual([]);
    expect(await ctx.attemptStore.get(envelopeId)).toBeNull();

    await ctx.processor.processEnvelope(ctx.env(envelopeId));
    expect(ctx.acked).toEqual([envelopeId]);
    expect([...ctx.messageStore.messages.values()]).toHaveLength(1);
  });
});
