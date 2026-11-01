import { describe, expect, it } from "vitest";

import { MemoryPendingReceiptStore } from "@/lib/db/pending-receipt-store";

describe("MemoryPendingReceiptStore", () => {
  it("dedupes enqueue and lists due by injected clock", async () => {
    const store = new MemoryPendingReceiptStore();
    const id = crypto.randomUUID();
    const conversationId = crypto.randomUUID();
    const now = 1_000;
    expect(
      await store.enqueue([
        {
          clientMessageId: id,
          conversationId,
          peerUserId: crypto.randomUUID(),
          peerDeviceId: crypto.randomUUID(),
          createdAt: now,
          nextAttemptAt: now + 50,
        },
        {
          clientMessageId: id,
          conversationId,
          peerUserId: crypto.randomUUID(),
          peerDeviceId: crypto.randomUUID(),
          createdAt: now,
          nextAttemptAt: now,
        },
      ]),
    ).toBe(1);
    expect(await store.listDue(now, 10)).toHaveLength(0);
    expect(await store.listDue(now + 50, 10)).toHaveLength(1);
    await store.markAttempt(id, now + 500, "boom");
    const row = await store.get(id);
    expect(row?.attemptCount).toBe(1);
    expect(row?.lastError).toBe("boom");
    expect(await store.remove([id])).toBe(1);
    expect(await store.count()).toBe(0);
  });
});
