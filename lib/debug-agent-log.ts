import Constants from "expo-constants";
import { Platform } from "react-native";

const SESSION_ID = "d03a4a";
const INGEST_PATH = "/ingest/a258b896-5edf-47f5-b7b6-6884a84b64b2";

function ingestBases(): string[] {
  const bases = ["http://127.0.0.1:7859"];
  const api =
    process.env.EXPO_PUBLIC_API_URL ??
    (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined);
  if (api) {
    try {
      const host = new URL(api).hostname;
      if (host && host !== "127.0.0.1" && host !== "localhost") {
        bases.push(`http://${host}:7859`);
      }
    } catch {
      /* noop */
    }
  }
  return bases;
}

export function agentDebugLog(
  location: string,
  message: string,
  data: Record<string, unknown>,
  hypothesisId: string,
  runId = "pre-fix",
): void {
  const payload = {
    sessionId: SESSION_ID,
    location,
    message,
    data,
    hypothesisId,
    runId,
    timestamp: Date.now(),
  };
  if (__DEV__) {
    console.log(`[DEBUG-${SESSION_ID}]`, JSON.stringify(payload));
  }
  // Native: skip ingest HTTP — parallel fetches to host:7859 (no listener) starve
  // OkHttp connections to the same LAN IP and block API calls on :5066.
  if (Platform.OS !== "web") {
    return;
  }
  for (const base of ingestBases()) {
    fetch(`${base}${INGEST_PATH}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": SESSION_ID,
      },
      body: JSON.stringify(payload),
    }).catch(() => {});
  }
}
