import { describe, expect, it } from "vitest";
import { MemoryGroupReceiptStore } from "@/lib/db/group-receipt-store";

describe("MemoryGroupReceiptStore", () => {
  it("aggregates delivered/read by user with injected ids", async () => {
    const store = new MemoryGroupReceiptStore();
    const groupId = crypto.randomUUID();
    const msg = crypto.randomUUID();
    const u1 = crypto.randomUUID();
    const u2 = crypto.randomUUID();
    await store.upsert({
      groupId,
      clientMessageId: msg,
      fromUserId: u1,
      fromDeviceId: crypto.randomUUID(),
      kind: "delivered",
      at: 1,
    });
    await store.upsert({
      groupId,
      clientMessageId: msg,
      fromUserId: u2,
      fromDeviceId: crypto.randomUUID(),
      kind: "read",
      at: 2,
    });
    const agg = await store.aggregate(groupId, msg);
    expect(agg.deliveredUserIds.sort()).toEqual([u1, u2].sort());
    expect(agg.readUserIds).toEqual([u2]);
  });
});
