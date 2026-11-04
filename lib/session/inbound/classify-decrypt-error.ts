export type DecryptFailureKind = "transient" | "permanent" | "needs_user";

export type ClassifyDecryptErrorOptions = {
  /** Peer identity marked keyChanged locally. */
  keyChanged?: boolean;
};

/**
 * Maps decrypt / inbound failures onto handling classes.
 * Prefer explicit error names; fall back to message substrings from libsignal / app layers.
 */
export function classifyDecryptError(
  error: unknown,
  opts: ClassifyDecryptErrorOptions = {},
): DecryptFailureKind {
  if (opts.keyChanged) {
    return "needs_user";
  }

  const name = error instanceof Error ? error.name : "";
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();

  if (
    name === "AppAuthError" ||
    name === "DbLockedError" ||
    msg.includes("kek_missing") ||
    msg.includes("pin_required") ||
    msg.includes("db_locked") ||
    msg.includes("database is locked") ||
    msg.includes("db is locked") ||
    msg.includes("db not open") ||
    msg.includes("access to closed resource") ||
    msg.includes("sqlcipher") ||
    msg.includes("media transfer is not initialized") ||
    msg.includes("network request failed") ||
    msg.includes("failed to fetch") ||
    msg.includes("timeout") ||
    msg.includes("aborted") ||
    msg.includes("econnreset") ||
    msg.includes("offline")
  ) {
    return "transient";
  }

  if (
    msg.includes("duplicate message") ||
    msg.includes("duplicatemessage") ||
    msg.includes("old counter") ||
    msg.includes("bad mac") ||
    msg.includes("badmac") ||
    msg.includes("invalid mac") ||
    msg.includes("invalid signature") ||
    msg.includes("invalidcharactererror") ||
    msg.includes("invalid character") ||
    msg.includes("not valid base64") ||
    msg.includes("incorrect padding") ||
    msg.includes("cipher is not authentic") ||
    msg.includes("message type") ||
    msg.includes("no valid sessions") ||
    msg.includes("no session") ||
    msg.includes("session not found") ||
    msg.includes("missing session") ||
    msg.includes("broken session") ||
    msg.includes("prekey not found") ||
    msg.includes("pre-key") ||
    msg.includes("onetime") ||
    msg.includes("one-time") ||
    msg.includes("signed pre key") ||
    msg.includes("signedprekey") ||
    msg.includes("invalidkeyid") ||
    msg.includes("invalid key id") ||
    msg.includes("untrusted identity key")
  ) {
    return "permanent";
  }

  // Unknown decrypt failures: retry briefly; attempt/age caps promote to permanent.
  return "transient";
}

/** True when a permanent failure should also trigger a session-reset signal. */
export function shouldRequestSessionReset(error: unknown): boolean {
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return (
    msg.includes("no valid sessions") ||
    msg.includes("no session") ||
    msg.includes("session not found") ||
    msg.includes("missing session") ||
    msg.includes("broken session") ||
    msg.includes("prekey not found") ||
    msg.includes("pre-key") ||
    msg.includes("onetime") ||
    msg.includes("one-time") ||
    msg.includes("signed pre key") ||
    msg.includes("signedprekey") ||
    msg.includes("invalidkeyid") ||
    msg.includes("invalid key id")
  );
}
