/**
 * Gdot libsignal module — production crypto uses
 * @privacyresearch/libsignal-protocol-typescript via lib/crypto/signal-engine.ts.
 * Native iOS/Android shells in this package register the Expo module name;
 * cryptographic operations run in the audited TypeScript implementation (Hermes).
 */

export {
  SignalEngine,
} from "../../../lib/crypto/signal-engine";
export { ensureSignalInitialized } from "../../../lib/crypto/init-signal";
