import { describe, expect, it } from "vitest";

import type { Conversation } from "@/lib/db/types";
import {
  MemoryPendingOutgoingSendStore,
  SendRetryService,
} from "@/lib/session/send-retry";
import {
  SEND_BACKOFF_BASE_MS,
  SEND_MAX_ATTEMPTS,
} from "@/lib/session/send-retry-constants";

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

describe("SendRetryService", () => {
  it("delivers due item and removes it", async () => {
    let now = 3_000_000;
    const store = new MemoryPendingOutgoingSendStore();
    const c = conv();
    const clientMessageId = crypto.randomUUID();
    const localMessageId = crypto.randomUUID();
    const plaintext = `msg_${crypto.randomUUID().slice(0, 8)}`;
    const delivered: string[] = [];

    const svc = new SendRetryService({
      store,
      getConversation: async (id) => (id === c.id ? c : null),
      deliver: async ({ plaintext: t }) => {
        delivered.push(t);
      },
      clock: () => now,
      random: () => 0,
    });

    await svc.enqueueFailed({
      clientMessageId,
      localMessageId,
      conversationId: c.id,
      plaintext,
      createdAt: now,
      nextAttemptAt: now,
    });
    expect(await svc.flushDue()).toBe(1);
    expect(delivered).toEqual([plaintext]);
    expect(await store.get(clientMessageId)).toBeNull();
  });

  it("backs off with injected clock/random then succeeds", async () => {
    let now = 7_000_000;
    const store = new MemoryPendingOutgoingSendStore();
    const c = conv();
    const clientMessageId = crypto.randomUUID();
    const localMessageId = crypto.randomUUID();
    let fail = true;
    const attempts: number[] = [];

    const svc = new SendRetryService({
      store,
      getConversation: async () => c,
      deliver: async () => {
        attempts.push(now);
        if (fail) throw new Error(`transient-${attempts.length}`);
      },
      clock: () => now,
      random: () => 0.5,
    });

    await svc.enqueueFailed({
      clientMessageId,
      localMessageId,
      conversationId: c.id,
      plaintext: `p_${crypto.randomUUID().slice(0, 6)}`,
      createdAt: now,
      nextAttemptAt: now,
    });

    expect(await svc.flushDue()).toBe(0);
    const row = await store.get(clientMessageId);
    expect(row?.attemptCount).toBe(1);
    // random 0.5 → floor(0.5 * (base*2^1 + 1))
    const expectedDelay = Math.floor(0.5 * (SEND_BACKOFF_BASE_MS * 2 + 1));
    expect(row?.nextAttemptAt).toBe(now + expectedDelay);

    now = row!.nextAttemptAt - 1;
    expect(await svc.flushDue()).toBe(0);

    fail = false;
    now = row!.nextAttemptAt;
    expect(await svc.flushDue()).toBe(1);
    expect(attempts.length).toBe(2);
    expect(await store.get(clientMessageId)).toBeNull();
  });

  it("gives up after max attempts without sleeping", async () => {
    let now = 11_000_000;
    const store = new MemoryPendingOutgoingSendStore();
    const c = conv();
    const clientMessageId = crypto.randomUUID();
    const localMessageId = crypto.randomUUID();
    const givenUp: string[] = [];

    const svc = new SendRetryService({
      store,
      getConversation: async () => c,
      deliver: async () => {
        throw new Error("always-fail");
      },
      onGiveUp: async (id) => {
        givenUp.push(id);
      },
      clock: () => now,
      random: () => 0,
      maxAttempts: 3,
    });

    await svc.enqueueFailed({
      clientMessageId,
      localMessageId,
      conversationId: c.id,
      plaintext: "x",
      createdAt: now,
      nextAttemptAt: now,
    });

    for (let i = 0; i < 5; i++) {
      await svc.flushDue();
      const row = await store.get(clientMessageId);
      if (!row) break;
      now = row.nextAttemptAt;
    }

    expect(givenUp).toEqual([localMessageId]);
    expect(await store.get(clientMessageId)).toBeNull();
    expect(SEND_MAX_ATTEMPTS).toBeGreaterThan(3);
  });

  it("flushDue is single-flight", async () => {
    let now = 13_000_000;
    const store = new MemoryPendingOutgoingSendStore();
    const c = conv();
    let inFlight = 0;
    let maxInFlight = 0;

    const svc = new SendRetryService({
      store,
      getConversation: async () => c,
      deliver: async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await Promise.resolve();
        inFlight -= 1;
      },
      clock: () => now,
      random: () => 0,
    });

    await svc.enqueueFailed({
      clientMessageId: crypto.randomUUID(),
      localMessageId: crypto.randomUUID(),
      conversationId: c.id,
      plaintext: "a",
      createdAt: now,
      nextAttemptAt: now,
    });

    const [a, b] = await Promise.all([svc.flushDue(), svc.flushDue()]);
    // Shared in-flight promise → both resolve to the same sent count.
    expect(a).toBe(1);
    expect(b).toBe(1);
    expect(maxInFlight).toBe(1);
  });
});
