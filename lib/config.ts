import Constants from "expo-constants";

/** REST API base including /v1 suffix */
export const API_BASE_URL =
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ??
  process.env.EXPO_PUBLIC_API_URL ??
  "https://192.168.1.0:5067/v1";

export const SIGNALR_HUB_URL = API_BASE_URL.replace(/\/v1\/?$/, "") + "/hubs/messages";

export const APP_LOCK_BACKGROUND_MS = 60_000;

export const SYNC_POLL_INTERVAL_MS = 30_000;
