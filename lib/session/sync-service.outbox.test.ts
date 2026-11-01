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
import {
  OUTBOX_MAX_RESENDS,
  OUTBOX_TTL_MS,
} from "@/lib/session/outbox-constants";
import { SyncService } from "@/lib/session/sync-service";
import { parseSignalPlaintext } from "@/lib/protocol/payload";

function fakeClock(start = 10_000_000) {
  let now = start;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

function makeSync() {
  const clock = fakeClock();
  const messageStore = new MemoryMessageStore();
  const conversationStore = new MemoryConversationStore();
  const identityStore = new MemoryIdentityStore();
  const sessionStore = new MemorySessionStore();
  const outboxStore = new MemoryOutboxStore();
  const sent: {
    recipientUserId: string;
    recipientDeviceId: string;
    ciphertextBase64: string;
    messageType: number;
  }[] = [];
  const encryptedPlaintexts: string[] = [];

  const peerUserId = crypto.randomUUID();
  const peerDeviceId = crypto.randomUUID();
  const conversationId = crypto.randomUUID();
  const localUserId = crypto.randomUUID();
  const localDeviceId = crypto.randomUUID();

  identityStore.local = {
    userId: localUserId,
    deviceId: localDeviceId,
    username: `u_${localUserId.slice(0, 6)}`,
    registrationId: 1,
    identityKeyPublic: new Uint8Array(32),
  };

  conversationStore.conversations.set(conversationId, {
    id: conversationId,
    peerUserId,
    peerUsername: `peer_${peerUserId.slice(0, 6)}`,
    peerDeviceId,
    lastMessagePreview: "",
    lastMessageAt: 0,
    unreadCount: 0,
  });

  const sync = new SyncService(
    {
      abortBackground: async () => undefined,
      send: async (req: (typeof sent)[number]) => {
        sent.push(req);
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
        _peerUserId: string,
        _peerDeviceId: string,
        plaintext: string,
      ) => {
        encryptedPlaintexts.push(plaintext);
        return {
          recipientUserId: peerUserId,
          recipientDeviceId: peerDeviceId,
          messageType: 2,
          ciphertextBase64: Buffer.from(plaintext).toString("base64"),
        };
      },
      replenishLocalPreKeysIfNeeded: async () => undefined,
    } as never,
    messageStore,
    conversationStore,
    identityStore,
    {
      getAccessToken: async () => "test-token",
      clearSessionExpired: async () => undefined,
    } as never,
    new MemoryReactionStore(),
    null,
    {
      quarantineStore: new MemoryEnvelopeQuarantineStore(),
      attemptStore: new MemoryEnvelopeAttemptStore(),
      sessionResetApi: { request: async () => undefined } as never,
      sessionStore,
      outboxStore,
      clock: () => clock.now(),
    },
  );

  return {
    sync,
    clock,
    messageStore,
    outboxStore,
    sent,
    encryptedPlaintexts,
    conversationId,
    peerDeviceId,
  };
}

describe("SyncService outbox + session-reset resend", () => {
  it("keeps sent plaintext in outbox until receipt", async () => {
    const ctx = makeSync();
    const text = `hello-${crypto.randomUUID()}`;
    await ctx.sync.sendOutgoing(ctx.conversationId, text);

    const pending = await ctx.outboxStore.listPendingForPeerDevice(
      ctx.peerDeviceId,
      ctx.clock.now(),
    );
    expect(pending).toHaveLength(1);
    expect(pending[0]?.plaintext).toBe(text);

    const msgs = await ctx.messageStore.listByConversation(
      ctx.conversationId,
      50,
    );
    expect(msgs).toHaveLength(1);
    expect(msgs[0]?.status).toBe("sent");
    expect(pending[0]?.clientMessageId).toBe(msgs[0]?.clientId);

    const parsed = parseSignalPlaintext(ctx.encryptedPlaintexts[0]!);
    expect(parsed.kind).toBe("text");
    if (parsed.kind === "text") {
      expect(parsed.payload.clientMessageId).toBe(msgs[0]?.clientId);
    }
  });

  it("resends unreceipted messages after SessionResetRequested with max resends", async () => {
    const ctx = makeSync();
    const text = `resend-${crypto.randomUUID()}`;
    await ctx.sync.sendOutgoing(ctx.conversationId, text);
    expect(ctx.sent).toHaveLength(1);

    await ctx.sync.handleSessionResetRequested(ctx.peerDeviceId);
    expect(ctx.sent.length).toBe(2);

    const msgs = await ctx.messageStore.listByConversation(
      ctx.conversationId,
      50,
    );
    const entry = await ctx.outboxStore.get(msgs[0]!.clientId);
    expect(entry?.resendCount).toBe(1);

    for (let i = 0; i < OUTBOX_MAX_RESENDS; i++) {
      await ctx.sync.handleSessionResetRequested(ctx.peerDeviceId);
    }
    const after = await ctx.outboxStore.get(entry!.clientMessageId);
    expect(after!.resendCount).toBe(OUTBOX_MAX_RESENDS);
    const sendsAtCap = ctx.sent.length;
    await ctx.sync.handleSessionResetRequested(ctx.peerDeviceId);
    expect(ctx.sent.length).toBe(sendsAtCap);
  });

  it("skips expired outbox entries on session reset", async () => {
    const ctx = makeSync();
    await ctx.sync.sendOutgoing(ctx.conversationId, "ttl-me");
    ctx.clock.advance(OUTBOX_TTL_MS + 1);
    const before = ctx.sent.length;
    await ctx.sync.handleSessionResetRequested(ctx.peerDeviceId);
    expect(ctx.sent.length).toBe(before);
    expect(
      await ctx.outboxStore.listPendingForPeerDevice(
        ctx.peerDeviceId,
        ctx.clock.now(),
      ),
    ).toHaveLength(0);
  });
});
