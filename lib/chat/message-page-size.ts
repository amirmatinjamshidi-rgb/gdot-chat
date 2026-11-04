/**
 * Initial / page size for chat message lists.
 * Fills ~3× the viewport so short scrolls don't immediately hit the loader,
 * while staying bounded for memory on large screens / small fonts.
 */
export const MESSAGE_PAGE_SIZE_MIN = 30;
export const MESSAGE_PAGE_SIZE_MAX = 120;
/** Approximate bubble height at fontScale 1 (dp). */
export const MESSAGE_ROW_HEIGHT_DP = 60;

export function messagePageSize(
  windowHeight: number,
  fontScale = 1,
  estimatedRowHeightDp: number = MESSAGE_ROW_HEIGHT_DP,
): number {
  const height = Number.isFinite(windowHeight) ? Math.max(0, windowHeight) : 0;
  const scale =
    Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1;
  const row = Math.max(24, estimatedRowHeightDp * scale);
  const n = Math.ceil((height * 3) / row);
  return Math.min(
    MESSAGE_PAGE_SIZE_MAX,
    Math.max(MESSAGE_PAGE_SIZE_MIN, n),
  );
}
