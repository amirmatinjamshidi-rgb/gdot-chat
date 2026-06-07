import Constants from "expo-constants";
import { Platform } from "react-native";

/** REST API base including /v1 suffix */
export const API_BASE_URL =
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ??
  process.env.EXPO_PUBLIC_API_URL ??
  "http://192.168.0.177:5067/v1";

export const SIGNALR_HUB_URL = API_BASE_URL.replace(/\/v1\/?$/, "") + "/hubs/messages";

export const APP_LOCK_BACKGROUND_MS = 60_000;

export const SYNC_POLL_INTERVAL_MS = 30_000;

/** SignalR WebSocket blocks concurrent fetch() to the same host on Android. */
export const ENABLE_SIGNALR = Platform.OS === "web";
