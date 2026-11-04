import { afterEach, describe, expect, it, vi } from "vitest";

import { MemoryEnvelopeAttemptStore } from "@/lib/db/envelope-attempt-store";
import { MemoryEnvelopeQuarantineStore } from "@/lib/db/envelope-quarantine-store";
import { MemoryOutboxStore } from "@/lib/db/outbox-store";
import { MemoryPendingReceiptStore } from "@/lib/db/pending-receipt-store";
import { DbLockedError } from "@/lib/db/db-errors";
import {
  MemoryConversationStore,
  MemoryIdentityStore,
  MemoryMessageStore,
  MemoryReactionStore,
  MemorySessionStore,
} from "@/lib/test/memory-stores";
import { MemoryPendingOutgoingSendStore } from "@/lib/session/send-retry";
import { appLockStore } from "@/lib/session/app-lock-store";
import { SyncService } from "@/lib/session/sync-service";

afterEach(() => {
  appLockStore.lock();
});

describe("SyncService lock message safety", () => {
  function makeSync(opts?: {
    sendImpl?: () => Promise<{ envelopeId: string }>;
    resumeInterrupted?: () => Promise<void>;
  }) {
    const messageStore = new MemoryMessageStore();
    const conversationStore = new MemoryConversationStore();
    const identityStore = new MemoryIdentityStore();
    const outboxStore = new MemoryOutboxStore();
    const pendingOutgoing = new MemoryPendingOutgoingSendStore();
    const pendingReceipts = new MemoryPendingReceiptStore();

    const localUserId = crypto.randomUUID();
    const localDeviceId = crypto.randomUUID();
    identityStore.local = {
      userId: localUserId,
      deviceId: localDeviceId,
      username: `u_${localUserId.slice(0, 6)}`,
      registrationId: 1,
      identityKeyPublic: new Uint8Array(32),
    };

    const peerUserId = crypto.randomUUID();
    const peerDeviceId = crypto.randomUUID();
    const conversationId = crypto.randomUUID();
    conversationStore.conversations.set(conversationId, {
      id: conversationId,
      peerUserId,
      peerUsername: `peer_${peerUserId.slice(0, 6)}`,
      peerDeviceId,
      lastMessagePreview: "",
      lastMessageAt: 0,
      unreadCount: 0,
    });

    let sendCount = 0;
    const getPending = vi.fn(async () => [] as never[]);
    const resumeInterrupted =
      opts?.resumeInterrupted ?? vi.fn(async () => undefined);

    const sync = new SyncService(
      {
        abortBackground: async () => undefined,
        send: async () => {
          sendCount += 1;
          if (opts?.sendImpl) return opts.sendImpl();
          return { envelopeId: crypto.randomUUID() };
        },
        getPending,
        ack: async () => undefined,
      } as never,
      {
        runWithTransportPaused: async <T>(fn: () => Promise<T>) => fn(),
        setPreKeysLowHandler: () => undefined,
        setSessionResetHandler: () => undefined,
        setGroupMembershipChangedHandler: () => undefined,
        setEnvelopeHandler: () => undefined,
        setConnectionHandler: () => undefined,
        disconnect: async () => undefined,
        isConnected: () => false,
        connect: async () => undefined,
      } as never,
      {
        replenishLocalPreKeysIfNeeded: async () => undefined,
        encryptOutgoing: async (
          _u: string,
          _d: string,
          plaintext: string,
        ) => ({
          recipientUserId: peerUserId,
          recipientDeviceId: peerDeviceId,
          messageType: 2,
          ciphertextBase64: Buffer.from(plaintext).toString("base64"),
        }),
      } as never,
      messageStore,
      conversationStore,
      identityStore,
      {
        getAccessToken: async () => "test-token",
        getDeviceId: async () => localDeviceId,
        getUserId: () => localUserId,
        clearSessionExpired: async () => undefined,
      } as never,
      new MemoryReactionStore(),
      { resumeInterrupted } as never,
      {
        quarantineStore: new MemoryEnvelopeQuarantineStore(),
        attemptStore: new MemoryEnvelopeAttemptStore(),
        sessionResetApi: { request: async () => undefined } as never,
        sessionStore: new MemorySessionStore(),
        outboxStore,
        pendingOutgoingSendStore: pendingOutgoing,
        pendingReceiptStore: pendingReceipts,
      },
    );

    const sendRetry = (
      sync as unknown as {
        sendRetry: { flushDue: () => Promise<number> };
      }
    ).sendRetry;
    const receiptRetry = (
      sync as unknown as {
        receiptRetry: { flushDue: () => Promise<number> };
      }
    ).receiptRetry;

    const sendFlushCalls: number[] = [];
    const receiptFlushCalls: number[] = [];
    const origSendFlush = sendRetry.flushDue.bind(sendRetry);
    sendRetry.flushDue = async () => {
      sendFlushCalls.push(Date.now());
      return origSendFlush();
    };
    const origReceiptFlush = receiptRetry.flushDue.bind(receiptRetry);
    receiptRetry.flushDue = async () => {
      receiptFlushCalls.push(Date.now());
      return origReceiptFlush();
    };

    return {
      sync,
      messageStore,
      conversationId,
      outboxStore,
      pendingOutgoing,
      getPending,
      resumeInterrupted,
      sendFlushCalls,
      receiptFlushCalls,
      getSendCount: () => sendCount,
    };
  }

  it("outbound: DB_LOCKED during send keeps pending + retry queue (not failed); unlock delivers once", async () => {
    appLockStore.unlock();
    let sends = 0;
    const ctx = makeSync({
      sendImpl: async () => {
        sends += 1;
        if (sends === 1) throw new DbLockedError();
        return { envelopeId: crypto.randomUUID() };
      },
    });

    const text = `out_${crypto.randomUUID().slice(0, 8)}`;
    await ctx.sync.sendOutgoing(ctx.conversationId, text);

    const msgs = [...ctx.messageStore.messages.values()];
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.status).toBe("pending");
    expect(msgs[0]!.plaintext).toBe(text);

    const queued = await ctx.pendingOutgoing.listDue(Number.MAX_SAFE_INTEGER, 10);
    expect(queued).toHaveLength(1);
    expect(queued[0]!.plaintext).toBe(text);

    // Unlock path: flush send retry (as start() does)
    expect(await (ctx.sync as unknown as {
      sendRetry: { flushDue: () => Promise<number> };
    }).sendRetry.flushDue()).toBe(1);

    const after = [...ctx.messageStore.messages.values()];
    expect(after).toHaveLength(1);
    expect(after[0]!.status).toBe("sent");
    expect(sends).toBe(2);
    expect(await ctx.pendingOutgoing.listDue(Number.MAX_SAFE_INTEGER, 10)).toEqual(
      [],
    );
  });

  it("unlock start triggers pull + outbox/send flush + receipt flush + media resume once", async () => {
    appLockStore.unlock();
    const resumeInterrupted = vi.fn(async () => undefined);
    const ctx = makeSync({ resumeInterrupted });

    await ctx.sync.start();

    // Allow fire-and-forget pull/flushes from startInner to settle
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 20));

    expect(ctx.getPending).toHaveBeenCalled();
    expect(ctx.sendFlushCalls.length).toBeGreaterThanOrEqual(1);
    expect(ctx.receiptFlushCalls.length).toBeGreaterThanOrEqual(1);
    expect(resumeInterrupted).toHaveBeenCalledTimes(1);

    await ctx.sync.stop();
  });
});
