import { resolveApiBaseUrl } from "@/lib/config/api-base-url";

export { resolveApiBaseUrl } from "@/lib/config/api-base-url";

/** REST API base including /v1 suffix — must come from EXPO_PUBLIC_API_URL (or expo extra). */
export const API_BASE_URL = resolveApiBaseUrl();

export const SIGNALR_HUB_URL =
  API_BASE_URL.replace(/\/v1\/?$/, "") + "/hubs/messages";

/** @deprecated Immediate lock on background; kept as 0 for any leftover imports. */
export const APP_LOCK_BACKGROUND_MS = 0;

export const SYNC_POLL_INTERVAL_MS = 30_000;

/** Collapse bursts of EnvelopeAvailable / reconnect sync triggers. */
export const SYNC_PULL_DEBOUNCE_MS = 250;

export const MEDIA_CHUNK_TIMEOUT_MS = 120_000;

/** Product-level recording cap (not a transfer protocol limit). */
export const VIDEO_RECORD_MAX_MS = 20 * 60 * 1000;
export const VOICE_RECORD_MAX_MS = 20 * 60 * 1000;

/**
 * Live inbox via SignalR on all platforms (web + iOS/Android) while the app is
 * foregrounded. Native uses WebSockets; SyncService pauses the hub during
 * critical REST sends to avoid Android's single-host HTTP/WS contention, and
 * falls back to {@link SYNC_POLL_INTERVAL_MS} polling while disconnected.
 */
export const ENABLE_SIGNALR = true;
