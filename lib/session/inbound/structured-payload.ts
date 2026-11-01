import type { ParsedSignalPlaintext } from "@/lib/protocol/payload";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Detects plaintext that claimed a v1 structured Signal payload but failed to parse
 * into text/media/reaction (so we must not show raw JSON as a message).
 */
export function isInvalidStructuredPayload(
  plaintext: string,
  parsed: ParsedSignalPlaintext,
): boolean {
  if (parsed.kind !== "legacy-text") return false;
  const trimmed = plaintext.trim();
  if (!trimmed.startsWith("{")) return false;
  try {
    const raw: unknown = JSON.parse(trimmed);
    return isRecord(raw) && raw.v === 1;
  } catch {
    return false;
  }
}
