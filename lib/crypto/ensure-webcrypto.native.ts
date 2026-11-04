import { getRandomBytes } from "expo-crypto";
import { Platform } from "react-native";
// ESM import so Metro/Vitest resolve aliases; do not call install() (keeps Buffer).
import { subtle as quickCryptoSubtle } from "react-native-quick-crypto";

export function expoGetRandomValues<T extends ArrayBufferView>(
  typedArray: T,
): T {
  const bytes = getRandomBytes(typedArray.byteLength);
  const view = new Uint8Array(
    typedArray.buffer,
    typedArray.byteOffset,
    typedArray.byteLength,
  );
  view.set(bytes);
  return typedArray;
}

function hasWorkingSubtle(
  cryptoLike: Crypto | undefined,
): cryptoLike is Crypto {
  return typeof cryptoLike?.subtle?.importKey === "function";
}

function loadQuickCryptoSubtle(): SubtleCrypto | undefined {
  try {
    if (typeof quickCryptoSubtle?.importKey === "function") {
      return quickCryptoSubtle as SubtleCrypto;
    }
  } catch {
    // Native module unavailable or incomplete link.
  }
  return undefined;
}

function assignSubtle(target: Crypto, subtle: SubtleCrypto): void {
  try {
    (target as Crypto & { subtle: SubtleCrypto }).subtle = subtle;
  } catch {
    Object.defineProperty(target, "subtle", {
      value: subtle,
      configurable: true,
      enumerable: true,
    });
  }
}

export type EnsureWebCryptoOptions = {
  /**
   * When `globalThis.crypto` is missing, called with the object to install.
   * React Native uses `polyfillGlobal`; tests can assign directly.
   */
  installCrypto?: (cryptoObj: Crypto) => void;
};

/**
 * Ensure `globalThis.crypto` has `getRandomValues` and WebCrypto `subtle`.
 *
 * Hermes often lacks `crypto` entirely. An earlier polyfill that only set
 * `getRandomValues` made libsignal take `globalThis.crypto` and skip its
 * `msrcrypto` fallback, then crash on `subtle.importKey`. Attach
 * react-native-quick-crypto's native SubtleCrypto (OpenSSL) instead.
 *
 * No-ops when subtle already works (browsers, Node/vitest via setup.ts)
 * for the subtle half; still fills getRandomValues if missing.
 * On web, never pulls Nitro. Does not call quick-crypto `install()`, so
 * global Buffer stays untouched.
 */
export function ensureWebCrypto(options: EnsureWebCryptoOptions = {}): void {
  const needsGrv = typeof globalThis.crypto?.getRandomValues !== "function";
  const needsSubtle = !hasWorkingSubtle(globalThis.crypto);

  if (!needsGrv && !needsSubtle) {
    return;
  }

  const subtle =
    needsSubtle && Platform.OS !== "web"
      ? loadQuickCryptoSubtle()
      : undefined;

  if (!globalThis.crypto) {
    const cryptoObj = {
      getRandomValues: expoGetRandomValues,
      ...(subtle ? { subtle } : {}),
    } as Crypto;
    if (options.installCrypto) {
      options.installCrypto(cryptoObj);
    } else {
      Object.defineProperty(globalThis, "crypto", {
        value: cryptoObj,
        configurable: true,
        writable: true,
        enumerable: true,
      });
    }
    return;
  }

  if (needsGrv) {
    globalThis.crypto.getRandomValues = expoGetRandomValues;
  }

  if (subtle) {
    assignSubtle(globalThis.crypto, subtle);
  }
}
