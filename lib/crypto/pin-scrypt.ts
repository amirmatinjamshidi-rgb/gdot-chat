import { scrypt as nobleScrypt } from "@noble/hashes/scrypt.js";

export type PinScryptParams = {
  N: number;
  r: number;
  p: number;
  dkLen: number;
};

/**
 * OpenSSL EVP_PBE_scrypt rejects when 128·N·r·p exceeds maxmem.
 * For N=2^17, r=8, p=1 that is 128 MiB; leave headroom.
 */
export const PIN_SCRYPT_MAXMEM = 256 * 1024 * 1024;

export type PinScryptDeriveFn = (
  password: Uint8Array,
  salt: Uint8Array,
  params: PinScryptParams,
) => Promise<Uint8Array>;

let deriveOverride: PinScryptDeriveFn | null = null;

/** Test-only: inject a mock / noble-backed deriver. Pass null to clear. */
export function setPinScryptDeriveForTests(fn: PinScryptDeriveFn | null): void {
  deriveOverride = fn;
}

/**
 * Derive a PIN wrap key with scrypt.
 * Prefers react-native-quick-crypto (native OpenSSL, off JS thread).
 * Falls back to @noble/hashes for Node/vitest when native is unavailable.
 */
export async function derivePinScryptKey(
  password: Uint8Array,
  salt: Uint8Array,
  params: PinScryptParams,
): Promise<Uint8Array> {
  if (deriveOverride) {
    return deriveOverride(password, salt, params);
  }

  const t0 = Date.now();
  try {
    const key = await deriveWithQuickCrypto(password, salt, params);
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      console.log(
        `[pin-scrypt] native N=${params.N} ${Date.now() - t0}ms`,
      );
    }
    return key;
  } catch (err) {
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      console.warn(
        `[pin-scrypt] native failed, falling back to noble:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  const t1 = Date.now();
  const key = nobleScrypt(password, salt, {
    N: params.N,
    r: params.r,
    p: params.p,
    dkLen: params.dkLen,
  });
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    console.log(`[pin-scrypt] noble N=${params.N} ${Date.now() - t1}ms`);
  }
  return key;
}

async function deriveWithQuickCrypto(
  password: Uint8Array,
  salt: Uint8Array,
  params: PinScryptParams,
): Promise<Uint8Array> {
  // Lazy require so vitest/Node can load pin-kek without linking Nitro.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { scrypt } = require("react-native-quick-crypto") as {
    scrypt: (
      password: Uint8Array,
      salt: Uint8Array,
      keylen: number,
      options: {
        N: number;
        r: number;
        p: number;
        maxmem: number;
      },
      callback: (err: Error | null, key?: Uint8Array) => void,
    ) => void;
  };

  return new Promise<Uint8Array>((resolve, reject) => {
    scrypt(
      password,
      salt,
      params.dkLen,
      {
        N: params.N,
        r: params.r,
        p: params.p,
        maxmem: PIN_SCRYPT_MAXMEM,
      },
      (err, key) => {
        if (err || !key) {
          reject(err ?? new Error("Native scrypt failed"));
          return;
        }
        resolve(Uint8Array.from(key));
      },
    );
  });
}
