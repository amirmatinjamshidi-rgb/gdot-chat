import { describe, expect, it } from "vitest";

import { deliveryTicksForStatus } from "@/components/reactions/delivery-status";

describe("deliveryTicksForStatus", () => {
  it("returns empty for peer messages", () => {
    expect(deliveryTicksForStatus(false, "delivered")).toBe("");
  });

  it("shows single tick for pending/sent and double for delivered", () => {
    expect(deliveryTicksForStatus(true, "pending")).toBe(" ✓");
    expect(deliveryTicksForStatus(true, "sent")).toBe(" ✓");
    expect(deliveryTicksForStatus(true, "delivered")).toBe(" ✓✓");
  });

  it("shows failed marker", () => {
    expect(deliveryTicksForStatus(true, "failed")).toBe(" !");
  });
});
