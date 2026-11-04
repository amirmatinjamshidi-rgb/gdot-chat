import { scrypt as nobleScrypt } from "@noble/hashes/scrypt.js";

import { AppAuthError } from "@/lib/auth/app-auth-error";

export type PinScryptParams = {
  N: number;
  r: number;
  p: number;
  dkLen: number;
};

export const PIN_SCRYPT_MAXMEM = 256 * 1024 * 1024;

export type PinScryptDeriveFn = (
  password: Uint8Array,
  salt: Uint8Array,
  params: PinScryptParams,
) => Promise<Uint8Array>;

let deriveOverride: PinScryptDeriveFn | null = null;

export function setPinScryptDeriveForTests(fn: PinScryptDeriveFn | null): void {
  deriveOverride = fn;
}

/** Web never uses the native OpenSSL scrypt path. */
export function isNativePinScryptPlatform(_os?: string): boolean {
  return false;
}

export async function derivePinScryptKey(
  password: Uint8Array,
  salt: Uint8Array,
  params: PinScryptParams,
): Promise<Uint8Array> {
  if (deriveOverride) {
    return deriveOverride(password, salt, params);
  }
  try {
    return nobleScrypt(password, salt, {
      N: params.N,
      r: params.r,
      p: params.p,
      dkLen: params.dkLen,
    });
  } catch (err) {
    throw new AppAuthError(
      "UNKNOWN",
      err instanceof Error ? err.message : "PIN derivation failed",
    );
  }
}
