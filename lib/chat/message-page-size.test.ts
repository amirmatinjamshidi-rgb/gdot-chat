import { describe, expect, test } from "vitest";

import {
  MESSAGE_PAGE_SIZE_MAX,
  MESSAGE_PAGE_SIZE_MIN,
  messagePageSize,
} from "./message-page-size";

describe("messagePageSize", () => {
  test("clamps to minimum on short screens", () => {
    expect(messagePageSize(200, 1)).toBe(MESSAGE_PAGE_SIZE_MIN);
  });

  test("clamps to maximum on tall screens / tiny fonts", () => {
    expect(messagePageSize(4000, 0.5)).toBe(MESSAGE_PAGE_SIZE_MAX);
  });

  test("scales with window height (~3 viewports)", () => {
    // 800 / 60 * 3 ≈ 40
    expect(messagePageSize(800, 1)).toBe(40);
  });

  test("larger fontScale yields fewer rows", () => {
    const normal = messagePageSize(900, 1);
    const large = messagePageSize(900, 2);
    expect(large).toBeLessThan(normal);
    expect(large).toBeGreaterThanOrEqual(MESSAGE_PAGE_SIZE_MIN);
  });

  test("guards non-finite inputs", () => {
    expect(messagePageSize(Number.NaN, 1)).toBe(MESSAGE_PAGE_SIZE_MIN);
    expect(messagePageSize(800, Number.NaN)).toBe(40);
    expect(messagePageSize(800, 0)).toBe(40);
  });
});
