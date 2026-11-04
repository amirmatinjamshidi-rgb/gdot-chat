import { getRandomBytes } from "expo-crypto";

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

export type EnsureWebCryptoOptions = {
  installCrypto?: (cryptoObj: Crypto) => void;
};

/** Web already ships WebCrypto; only polyfill getRandomValues if missing. */
export function ensureWebCrypto(options: EnsureWebCryptoOptions = {}): void {
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    return;
  }

  const cryptoObj = {
    getRandomValues: expoGetRandomValues,
    ...(globalThis.crypto?.subtle
      ? { subtle: globalThis.crypto.subtle }
      : {}),
  } as Crypto;

  if (options.installCrypto) {
    options.installCrypto(cryptoObj);
    return;
  }

  Object.defineProperty(globalThis, "crypto", {
    value: cryptoObj,
    configurable: true,
    writable: true,
    enumerable: true,
  });
}
