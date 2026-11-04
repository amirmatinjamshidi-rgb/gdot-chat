import { describe, expect, it } from "vitest";

import {
  DbLockedError,
  isDbLockedError,
  isQuietDbCancel,
} from "@/lib/db/db-errors";

describe("DbLockedError helpers", () => {
  it("detects DbLockedError and code", () => {
    expect(isDbLockedError(new DbLockedError())).toBe(true);
    expect(isDbLockedError({ code: "DB_LOCKED" })).toBe(true);
    expect(isDbLockedError(new Error("DB not open"))).toBe(false);
  });

  it("treats lock/close races as quiet cancel", () => {
    expect(isQuietDbCancel(new DbLockedError())).toBe(true);
    expect(isQuietDbCancel(new Error("DB not open"))).toBe(true);
    expect(
      isQuietDbCancel(new Error("Access to closed resource")),
    ).toBe(true);
    expect(isQuietDbCancel(new Error("network"))).toBe(false);
  });
});
