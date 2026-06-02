import { randomUUID as expoRandomUUID } from "expo-crypto";

/** UUID v4 — use instead of global `crypto.randomUUID()` (not available in React Native). */
export function randomUUID(): string {
  return expoRandomUUID();
}
