import libsignal from "@privacyresearch/libsignal-protocol-typescript";

let initialized = false;

/** Load curve/crypto primitives once (required before KeyHelper / SessionCipher). */
export async function ensureSignalInitialized(): Promise<void> {
  if (initialized) return;
  await libsignal();
  initialized = true;
}
