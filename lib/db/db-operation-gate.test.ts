import { describe, expect, it } from "vitest";

import { DbLockedError } from "@/lib/db/db-errors";
import { DbOperationGate } from "@/lib/db/db-operation-gate";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("DbOperationGate", () => {
  it("rejects new ops with DB_LOCKED after close begins", async () => {
    const gate = new DbOperationGate();
    gate.markOpen();
    let closed = false;
    const closing = gate.closeExclusive(async () => {
      await delay(20);
      closed = true;
    });
    await expect(gate.runExclusive(async () => "x")).rejects.toBeInstanceOf(
      DbLockedError,
    );
    await closing;
    expect(closed).toBe(true);
  });

  it("close waits for in-flight op", async () => {
    const gate = new DbOperationGate();
    gate.markOpen();
    const order: string[] = [];
    const op = gate.runExclusive(async () => {
      order.push("op-start");
      await delay(40);
      order.push("op-end");
      return 1;
    });
    await delay(5);
    const closing = gate.closeExclusive(async () => {
      order.push("close");
    });
    await Promise.all([op, closing]);
    expect(order).toEqual(["op-start", "op-end", "close"]);
  });

  it("close is idempotent", async () => {
    const gate = new DbOperationGate();
    gate.markOpen();
    let closes = 0;
    await gate.closeExclusive(async () => {
      closes += 1;
    });
    await gate.closeExclusive(async () => {
      closes += 1;
    });
    expect(closes).toBe(2);
    await expect(gate.runExclusive(async () => 1)).rejects.toBeInstanceOf(
      DbLockedError,
    );
    gate.markOpen();
    await expect(gate.runExclusive(async () => 2)).resolves.toBe(2);
  });
});
