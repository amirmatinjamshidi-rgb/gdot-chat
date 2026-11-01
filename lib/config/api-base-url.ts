import Constants from "expo-constants";

export type ApiUrlEnv = {
  readonly EXPO_PUBLIC_API_URL?: string | undefined;
};

/**
 * Resolve REST API base including /v1. No hardcoded LAN IP fallback.
 * Pass `extraApiBaseUrl` explicitly (including null) to bypass expo-constants.
 */
export function resolveApiBaseUrl(
  env: ApiUrlEnv = process.env as ApiUrlEnv,
  extraApiBaseUrl?: string | null,
): string {
  const fromExtraRaw =
    arguments.length >= 2
      ? extraApiBaseUrl
      : (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined);
  const fromEnv = env.EXPO_PUBLIC_API_URL?.trim() || undefined;
  const fromExtra = fromExtraRaw?.trim() || undefined;
  const raw = fromEnv ?? fromExtra;

  if (raw) {
    return raw.replace(/\/$/, "");
  }

  const message =
    "EXPO_PUBLIC_API_URL is required (e.g. http://192.168.x.x:5066/v1). " +
    "Copy .env.example to .env and set it for your machine/emulator. " +
    "There is no hardcoded LAN IP fallback.";

  if (typeof __DEV__ !== "undefined" && __DEV__) {
    throw new Error(message);
  }

  throw new Error("EXPO_PUBLIC_API_URL is not configured for this build.");
}
