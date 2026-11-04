import { describe, expect, it } from "vitest";

import { runLockShutdown } from "@/lib/session/lock-shutdown";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("runLockShutdown", () => {
  it("awaits stopSync before closeDb", async () => {
    const order: string[] = [];
    await runLockShutdown({
      stopSync: async () => {
        order.push("stop-start");
        await delay(30);
        order.push("stop-end");
      },
      closeDb: async () => {
        order.push("close");
      },
    });
    expect(order).toEqual(["stop-start", "stop-end", "close"]);
  });

  it("still closes when stopSync throws", async () => {
    let closed = false;
    await runLockShutdown({
      stopSync: async () => {
        throw new Error("stop failed");
      },
      closeDb: async () => {
        closed = true;
      },
    });
    expect(closed).toBe(true);
  });
});
