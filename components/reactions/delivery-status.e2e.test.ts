import { describe, expect, it } from "vitest";

import { deliveryTicksForStatus } from "@/components/reactions/delivery-status";

/**
 * E2E-style UI contract: outgoing status progression maps to ticks.
 */
describe("delivery ticks UI contract", () => {
  it("progresses pending → sent → delivered without regressions", () => {
    const statuses = ["pending", "sent", "delivered"] as const;
    const ticks = statuses.map((s) => deliveryTicksForStatus(true, s));
    expect(ticks).toEqual([" ✓", " ✓", " ✓✓"]);
    expect(ticks[2]!.length).toBeGreaterThan(ticks[0]!.length);
  });
});
