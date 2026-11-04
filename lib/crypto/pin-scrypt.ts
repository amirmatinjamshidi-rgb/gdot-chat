import { scrypt as nobleScrypt } from "@noble/hashes/scrypt.js";
import { Platform } from "react-native";
import { scrypt as quickCryptoScrypt } from "react-native-quick-crypto";

import { AppAuthError } from "@/lib/auth/app-auth-error";

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

/** True on iOS/Android app builds. Web and Node/vitest stubs may differ. */
export function isNativePinScryptPlatform(
  os: string = Platform.OS,
): boolean {
  return os === "ios" || os === "android";
}

type QuickScryptFn = (
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

/**
 * Derive a PIN wrap key with scrypt.
 * Prefers react-native-quick-crypto (native OpenSSL, off JS thread).
 * On native (ios/android): native failure is a hard error — never falls back
 * to @noble/hashes (blocks UI and is weaker). Noble is allowed only on web
 * (and via setPinScryptDeriveForTests in unit tests).
 */
export async function derivePinScryptKey(
  password: Uint8Array,
  salt: Uint8Array,
  params: PinScryptParams,
): Promise<Uint8Array> {
  if (deriveOverride) {
    return deriveOverride(password, salt, params);
  }

  const native = isNativePinScryptPlatform();
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
    if (native) {
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.warn(
          `[pin-scrypt] native failed (no noble fallback on ${Platform.OS}):`,
          err instanceof Error ? err.message : err,
        );
      }
      throw new AppAuthError(
        "NATIVE_SCRYPT_UNAVAILABLE",
        err instanceof Error ? err.message : undefined,
      );
    }
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      console.warn(
        `[pin-scrypt] native unavailable on ${Platform.OS}, using noble:`,
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
  const scrypt = quickCryptoScrypt as QuickScryptFn | undefined;
  if (typeof scrypt !== "function") {
    throw new Error("react-native-quick-crypto scrypt is unavailable");
  }

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
