import { scrypt as nobleScrypt } from "@noble/hashes/scrypt.js";

const subtle = {
  importKey: async () => ({}) as CryptoKey,
  encrypt: async () => new ArrayBuffer(0),
  decrypt: async () => new ArrayBuffer(0),
  sign: async () => new ArrayBuffer(0),
  digest: async () => new ArrayBuffer(0),
} as unknown as SubtleCrypto;

let failNextScrypt = false;

/** Test-only: make the next scrypt callback fail (native unavailable). */
export function setQuickCryptoScryptFailForTests(fail: boolean): void {
  failNextScrypt = fail;
}

/** Vitest stand-in for react-native-quick-crypto.scrypt (OpenSSL path). */
export function scrypt(
  password: Uint8Array,
  salt: Uint8Array,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem?: number },
  callback: (err: Error | null, key?: Uint8Array) => void,
): void {
  if (failNextScrypt) {
    failNextScrypt = false;
    Promise.resolve().then(() =>
      callback(new Error("simulated native scrypt failure")),
    );
    return;
  }
  try {
    const key = nobleScrypt(password, salt, {
      N: options.N,
      r: options.r,
      p: options.p,
      dkLen: keylen,
    });
    Promise.resolve().then(() => callback(null, key));
  } catch (e) {
    Promise.resolve().then(() =>
      callback(e instanceof Error ? e : new Error(String(e))),
    );
  }
}

export { subtle };
export default { subtle, scrypt };
