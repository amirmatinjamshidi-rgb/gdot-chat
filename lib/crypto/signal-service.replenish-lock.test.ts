import { describe, expect, it, vi } from "vitest";

import { DbLockedError } from "@/lib/db/db-errors";
import { SignalService } from "@/lib/crypto/signal-service";

describe("SignalService replenish quiet cancel", () => {
  it("does not retry when replenish hits DB_LOCKED", async () => {
    const replenish = vi.fn(async () => {
      throw new DbLockedError();
    });
    const svc = new SignalService(
      {} as never,
      {} as never,
      {} as never,
      { replenishOneTimePreKeys: replenish } as never,
      {} as never,
    );
    await expect(svc.replenishLocalPreKeysIfNeeded()).resolves.toBeUndefined();
    expect(replenish).toHaveBeenCalledTimes(1);
  });
});
