import { describe, expect, it } from "vitest";

import type { Conversation } from "@/lib/db/types";
import { DbLockedError } from "@/lib/db/db-errors";
import {
  MemoryPendingOutgoingSendStore,
  SendRetryService,
} from "@/lib/session/send-retry";

function conv(): Conversation {
  return {
    id: crypto.randomUUID(),
    peerUserId: crypto.randomUUID(),
    peerUsername: `u_${crypto.randomUUID().slice(0, 8)}`,
    peerDeviceId: crypto.randomUUID(),
    lastMessagePreview: "",
    lastMessageAt: 0,
    unreadCount: 0,
  };
}

describe("SendRetryService DB_LOCKED quiet cancel", () => {
  it("does not remove, give up, or bump attempts on DB_LOCKED", async () => {
    const now = 4_000_000;
    const store = new MemoryPendingOutgoingSendStore();
    const c = conv();
    const clientMessageId = crypto.randomUUID();
    const localMessageId = crypto.randomUUID();
    const gaveUp: string[] = [];
    let deliverCalls = 0;

    const svc = new SendRetryService({
      store,
      getConversation: async () => c,
      deliver: async () => {
        deliverCalls += 1;
        if (deliverCalls === 1) throw new DbLockedError();
      },
      onGiveUp: async (id) => {
        gaveUp.push(id);
      },
      clock: () => now,
      random: () => 0,
    });

    await svc.enqueueFailed({
      clientMessageId,
      localMessageId,
      conversationId: c.id,
      plaintext: "hi",
      createdAt: now,
      nextAttemptAt: now,
    });

    expect(await svc.flushDue()).toBe(0);
    const row = await store.get(clientMessageId);
    expect(row).not.toBeNull();
    expect(row!.attemptCount).toBe(0);
    expect(gaveUp).toEqual([]);

    expect(await svc.flushDue()).toBe(1);
    expect(await store.get(clientMessageId)).toBeNull();
    expect(gaveUp).toEqual([]);
  });
});
