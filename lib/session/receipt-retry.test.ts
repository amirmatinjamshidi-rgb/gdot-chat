import { describe, expect, it } from "vitest";

import { MemoryPendingReceiptStore } from "@/lib/db/pending-receipt-store";
import type { Conversation } from "@/lib/db/types";
import { parseSignalPlaintext } from "@/lib/protocol/payload";
import {
  ReceiptRetryService,
  receiptBackoffMs,
} from "@/lib/session/receipt-retry";
import {
  RECEIPT_MAX_ATTEMPTS,
  RECEIPT_QUEUE_MAX,
} from "@/lib/session/receipt-retry-constants";

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

describe("receiptBackoffMs", () => {
  it("is deterministic with injected random and grows with attempt", () => {
    const a0 = receiptBackoffMs(0, () => 1);
    const a3 = receiptBackoffMs(3, () => 1);
    expect(a3).toBeGreaterThan(a0);
    expect(receiptBackoffMs(2, () => 0)).toBe(0);
  });
});

describe("ReceiptRetryService", () => {
  it("sends immediately on enqueue when sendEncrypted succeeds", async () => {
    let now = 5_000_000;
    const store = new MemoryPendingReceiptStore();
    const c = conv();
    const sent: string[] = [];
    const ids = [crypto.randomUUID(), crypto.randomUUID()];
    const svc = new ReceiptRetryService({
      store,
      sendEncrypted: async (_c, plaintext) => {
        sent.push(plaintext);
      },
      getConversation: async (id) => (id === c.id ? c : null),
      clock: () => now,
      random: () => 0,
    });

    await svc.enqueueAndFlush(c, ids);
    expect(sent).toHaveLength(1);
    const parsed = parseSignalPlaintext(sent[0]!);
    expect(parsed.kind).toBe("receipt");
    if (parsed.kind === "receipt") {
      expect(parsed.payload.messageIds.sort()).toEqual([...ids].sort());
    }
    expect(await store.count()).toBe(0);
  });

  it("persists, backs off with injected clock, then succeeds on flushDue", async () => {
    let now = 9_000_000;
    const store = new MemoryPendingReceiptStore();
    const c = conv();
    let fail = true;
    const attempts: number[] = [];
    const msgId = crypto.randomUUID();
    const svc = new ReceiptRetryService({
      store,
      sendEncrypted: async () => {
        attempts.push(now);
        if (fail) throw new Error(`transient-${attempts.length}`);
      },
      getConversation: async () => c,
      clock: () => now,
      random: () => 0.5,
    });

    await svc.enqueueAndFlush(c, [msgId]);
    expect(await store.count()).toBe(1);
    const pending = await store.get(msgId);
    expect(pending?.attemptCount).toBe(1);
    expect(pending!.nextAttemptAt).toBeGreaterThan(now);

    // too early
    expect(await svc.flushDue()).toBe(0);
    expect(await store.count()).toBe(1);

    now = pending!.nextAttemptAt;
    fail = false;
    expect(await svc.flushDue()).toBe(1);
    expect(await store.count()).toBe(0);
    expect(attempts.length).toBeGreaterThanOrEqual(2);
  });

  it("dedupes enqueue by clientMessageId", async () => {
    const store = new MemoryPendingReceiptStore();
    const c = conv();
    const id = crypto.randomUUID();
    const svc = new ReceiptRetryService({
      store,
      sendEncrypted: async () => {
        throw new Error("offline");
      },
      getConversation: async () => c,
      clock: () => 1_000,
      random: () => 0,
    });
    await svc.enqueueAndFlush(c, [id, id]);
    await svc.enqueueAndFlush(c, [id]);
    expect(await store.count()).toBe(1);
  });

  it("drops after max attempts", async () => {
    let now = 1_000_000;
    const store = new MemoryPendingReceiptStore();
    const c = conv();
    const id = crypto.randomUUID();
    const maxAttempts = 3;
    const svc = new ReceiptRetryService({
      store,
      sendEncrypted: async () => {
        throw new Error("always");
      },
      getConversation: async () => c,
      clock: () => now,
      random: () => 0,
      maxAttempts,
    });
    await svc.enqueueAndFlush(c, [id]);
    for (let i = 0; i < maxAttempts + 2; i++) {
      const row = await store.get(id);
      if (!row) break;
      now = row.nextAttemptAt;
      await svc.flushDue();
    }
    expect(await store.get(id)).toBeNull();
    expect(maxAttempts).toBeLessThanOrEqual(RECEIPT_MAX_ATTEMPTS);
  });

  it("trims oldest when over queue max", async () => {
    const store = new MemoryPendingReceiptStore();
    const c = conv();
    let now = 2_000_000;
    const svc = new ReceiptRetryService({
      store,
      sendEncrypted: async () => {
        throw new Error("offline");
      },
      getConversation: async () => c,
      clock: () => now,
      random: () => 0,
      queueMax: 2,
    });
    const first = crypto.randomUUID();
    await svc.enqueueAndFlush(c, [first]);
    now += 1;
    await svc.enqueueAndFlush(c, [crypto.randomUUID()]);
    now += 1;
    await svc.enqueueAndFlush(c, [crypto.randomUUID()]);
    expect(await store.count()).toBe(2);
    expect(await store.get(first)).toBeNull();
    expect(RECEIPT_QUEUE_MAX).toBeGreaterThan(2);
  });
});
