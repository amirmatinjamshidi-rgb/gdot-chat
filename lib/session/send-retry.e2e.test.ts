import { describe, expect, it } from "vitest";

import type { Conversation } from "@/lib/db/types";
import {
  MemoryPendingOutgoingSendStore,
  SendRetryService,
} from "@/lib/session/send-retry";
import { decideSyncTransport } from "@/lib/session/sync-transport-policy";

/**
 * E2E: failed send → queued → network still down (backoff) → reconnect/foreground
 * advances clock to due → flush succeeds (simulates immediate retry on reconnect).
 */
describe("outgoing send retry E2E", () => {
  it("retries after reconnect once backoff window is due (injected clock)", async () => {
    let now = 20_000_000;
    const store = new MemoryPendingOutgoingSendStore();
    const conversation: Conversation = {
      id: crypto.randomUUID(),
      peerUserId: crypto.randomUUID(),
      peerUsername: `peer_${crypto.randomUUID().slice(0, 6)}`,
      peerDeviceId: crypto.randomUUID(),
      lastMessagePreview: "",
      lastMessageAt: now,
      unreadCount: 0,
    };
    const clientMessageId = crypto.randomUUID();
    const localMessageId = crypto.randomUUID();
    const plaintext = `hello_${crypto.randomUUID().slice(0, 8)}`;

    let networkUp = false;
    const delivered: { localMessageId: string; plaintext: string }[] = [];
    const status: string[] = [];

    const svc = new SendRetryService({
      store,
      getConversation: async (id) =>
        id === conversation.id ? conversation : null,
      deliver: async (args) => {
        if (!networkUp) throw new Error("offline");
        delivered.push({
          localMessageId: args.localMessageId,
          plaintext: args.plaintext,
        });
      },
      onDelivered: async (id) => {
        status.push(`sent:${id}`);
      },
      onGiveUp: async (id) => {
        status.push(`failed:${id}`);
      },
      clock: () => now,
      random: () => 0.25,
    });

    // Initial failure → enqueue (as SyncService.sendOutgoing catch would).
    await svc.enqueueFailed({
      clientMessageId,
      localMessageId,
      conversationId: conversation.id,
      plaintext,
      createdAt: now,
      nextAttemptAt: now,
    });
    expect(await svc.flushDue()).toBe(0);
    const afterFail = await store.get(clientMessageId);
    expect(afterFail?.attemptCount).toBe(1);

    // Simulate reconnect / foreground flush while backoff still pending.
    const transport = decideSyncTransport({
      signalRConnected: true,
      appInForeground: true,
      enableSignalR: true,
      hasValidToken: true,
    });
    expect(transport.shouldConnectSignalR).toBe(true);
    expect(await svc.flushDue()).toBe(0);

    // Advance clock to due (no sleep), network recovers, reconnect flush succeeds.
    now = afterFail!.nextAttemptAt;
    networkUp = true;
    expect(await svc.flushDue()).toBe(1);
    expect(delivered).toEqual([{ localMessageId, plaintext }]);
    expect(status).toEqual([`sent:${localMessageId}`]);
    expect(await store.get(clientMessageId)).toBeNull();
  });
});
