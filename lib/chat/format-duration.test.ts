import { describe, expect, it } from "vitest";

import { formatMediaDuration } from "@/lib/chat/format-duration";

describe("formatMediaDuration", () => {
  it("formats sub-minute durations as 0:SS", () => {
    expect(formatMediaDuration(0)).toBe("0:00");
    expect(formatMediaDuration(1500)).toBe("0:02");
    expect(formatMediaDuration(59_000)).toBe("0:59");
  });

  it("formats minute durations as M:SS", () => {
    expect(formatMediaDuration(60_000)).toBe("1:00");
    expect(formatMediaDuration(75_400)).toBe("1:15");
  });
});
