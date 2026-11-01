/** Keep plaintext outbox entries until receipt or this TTL. */
export const OUTBOX_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Cap pending (unreceipted) outbox rows per conversation. */
export const OUTBOX_MAX_PER_CONVERSATION = 200;

/** Max automatic resends after session reset per client message id. */
export const OUTBOX_MAX_RESENDS = 3;
