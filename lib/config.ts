import Constants from "expo-constants";

/** REST API base including /v1 suffix */
export const API_BASE_URL =
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ??
  process.env.EXPO_PUBLIC_API_URL ??
  "http://192.168.0.177:5067/v1";

export const SIGNALR_HUB_URL = API_BASE_URL.replace(/\/v1\/?$/, "") + "/hubs/messages";

export const APP_LOCK_BACKGROUND_MS = 60_000;

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
