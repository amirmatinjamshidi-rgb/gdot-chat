/** Shown in-chat when an envelope is permanently undecryptable / invalid. */
export const UNDISPLAYABLE_MESSAGE_PLACEHOLDER =
  "This message could not be displayed.";

/** Transient → permanent after this many failed attempts. */
export const ENVELOPE_MAX_ATTEMPTS = 5;

/** Transient → permanent after this age from first attempt (ms). */
export const ENVELOPE_MAX_ATTEMPT_AGE_MS = 24 * 60 * 60 * 1000;

/** Message-request quarantine TTL. */
export const MESSAGE_REQUEST_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Min gap between session-reset signals to the same peer (client-side). */
export const SESSION_RESET_CLIENT_COOLDOWN_MS = 60 * 60 * 1000;

export type Clock = () => number;

export const systemClock: Clock = () => Date.now();
