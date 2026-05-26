const SESSION_ID = "2b1c6d";
const INGEST_URL =
  "http://127.0.0.1:7393/ingest/7cb809d3-295c-4956-9a0f-552992b16ecd";
/** Bump when verifying bundle updates reach the device. */
export const DEBUG_BUILD_MARKER = "2026-05-26-post-fix-v1";
export function debugSessionLog(
  location: string,
  message: string,
  data: Record<string, unknown>,
  hypothesisId: string,
  runId = "pre-fix",
) {
  const payload = {
    sessionId: SESSION_ID,
    location,
    message,
    data,
    hypothesisId,
    runId,
    timestamp: Date.now(),
  };
  // Metro forwards device console output to the dev machine terminal.
  console.warn("[DEBUG]", JSON.stringify(payload));
}
