import libsignal, {
  setWebCrypto,
} from "@privacyresearch/libsignal-protocol-typescript";

let initialized = false;

/** Load curve/crypto primitives once (required before KeyHelper / SessionCipher). */
export async function ensureSignalInitialized(): Promise<void> {
  if (initialized) return;
  // libsignal captures globalThis.crypto at module load. Re-bind after our
  // polyfill so SessionCipher uses quick-crypto subtle (or Node webcrypto in
  // tests) even if the module was evaluated before subtle was attached.
  if (typeof globalThis.crypto?.subtle?.importKey === "function") {
    setWebCrypto(globalThis.crypto);
  }
  await libsignal();
  initialized = true;
}
