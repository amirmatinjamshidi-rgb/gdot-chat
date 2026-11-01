import { describe, expect, it } from "vitest";

import { exponentialBackoffMs } from "@/lib/session/backoff";

describe("exponentialBackoffMs", () => {
  it("is deterministic with injected random and respects cap", () => {
    const baseMs = 1_000;
    const maxMs = 8_000;
    // floor(1 * (exp + 1)) == exp + 1 (inclusive upper bound)
    expect(exponentialBackoffMs(0, { baseMs, maxMs, random: () => 1 })).toBe(
      baseMs + 1,
    );
    expect(exponentialBackoffMs(3, { baseMs, maxMs, random: () => 1 })).toBe(
      maxMs + 1,
    );
    expect(exponentialBackoffMs(2, { baseMs, maxMs, random: () => 0 })).toBe(0);
    expect(
      exponentialBackoffMs(1, { baseMs, maxMs, random: () => 1 }),
    ).toBeGreaterThan(
      exponentialBackoffMs(0, { baseMs, maxMs, random: () => 1 }),
    );
  });
});
