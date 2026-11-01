/** Full-jitter exponential backoff shared by receipt + outgoing send retries. */

export type BackoffRandom = () => number;

/**
 * Exponential backoff with full jitter: U(0, min(cap, base * 2^attempt)).
 * `attempt` is the upcoming attempt count (0-based or 1-based both OK; uses max(0, attempt)).
 */
export function exponentialBackoffMs(
  attempt: number,
  opts: {
    baseMs: number;
    maxMs: number;
    random?: BackoffRandom;
  },
): number {
  const random = opts.random ?? Math.random;
  const exp = Math.min(
    opts.maxMs,
    opts.baseMs * 2 ** Math.max(0, attempt),
  );
  return Math.floor(random() * (exp + 1));
}
