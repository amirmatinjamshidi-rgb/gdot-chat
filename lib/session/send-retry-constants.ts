/** Max automatic retries for a failed outgoing text send before giving up. */
export const SEND_MAX_ATTEMPTS = 8;

/** Base delay (ms) for exponential backoff: base * 2^attempt. */
export const SEND_BACKOFF_BASE_MS = 1_000;

/** Cap on backoff delay (ms). */
export const SEND_BACKOFF_MAX_MS = 5 * 60_000;

/** Max pending outgoing send retries retained (oldest dropped). */
export const SEND_QUEUE_MAX = 200;
