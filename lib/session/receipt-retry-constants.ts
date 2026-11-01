/** Max send attempts for a pending E2EE delivery receipt before giving up. */
export const RECEIPT_MAX_ATTEMPTS = 8;

/** Base delay (ms) for exponential backoff: base * 2^attempt. */
export const RECEIPT_BACKOFF_BASE_MS = 1_000;

/** Cap on backoff delay (ms). */
export const RECEIPT_BACKOFF_MAX_MS = 15 * 60_000;

/** Max pending receipt rows retained overall (oldest dropped). */
export const RECEIPT_QUEUE_MAX = 500;
