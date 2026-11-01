import { gcm } from "@noble/ciphers/aes.js";

import { AppAuthError } from "@/lib/auth/app-auth-error";
import { base64ToBytes, bytesToBase64, textToBytes } from "@/lib/crypto/encoding";
import {
  derivePinScryptKey,
  type PinScryptParams,
} from "@/lib/crypto/pin-scrypt";
import { hexToBytes } from "@/lib/db/sql-utils";

export type { PinScryptParams } from "@/lib/crypto/pin-scrypt";

/** Passphrase-style app PIN: min 8, max 128; letters/digits/symbols allowed. */
export const APP_PIN_MIN_LENGTH = 8;
export const APP_PIN_MAX_LENGTH = 128;

/**
 * Blob format version.
 * Absent or 1 = pre-native JS scrypt wraps (still unwrap with same params).
 * 2 = current wraps produced via native/async scrypt path.
 */
export const PIN_KEK_BLOB_VERSION = 2;

/**
 * Current scrypt parameters for PIN → wrap key.
 * N=2^17 targets ~0.5–2s natively on mid phones; memory ≈ 128·N·r ≈ 128 MiB.
 * Per-wrap params are stored so older blobs (e.g. N=2^15) still unlock.
 */
export const PIN_SCRYPT = {
  N: 2 ** 17,
  r: 8,
  p: 1,
  dkLen: 32,
} as const satisfies PinScryptParams;

/** Legacy default when blob omits kdf (pre-param blobs). */
export const PIN_SCRYPT_LEGACY = {
  N: 2 ** 15,
  r: 8,
  p: 1,
  dkLen: 32,
} as const satisfies PinScryptParams;

export const PIN_SALT_BYTES = 16;
export const PIN_NONCE_BYTES = 12;

const PIN_AAD = textToBytes("gdot-pin-kek-v1");

export type PinWrappedKek = {
  saltB64: string;
  nonceB64: string;
  ciphertextB64: string;
  /** Present on new wraps; absent ⇒ treat as PIN_SCRYPT_LEGACY. */
  kdf?: PinScryptParams;
  /** Absent/1 = legacy JS wraps; 2 = current native async path. */
  v?: number;
};

export function validateAppPin(pin: string): void {
  if (pin.length < APP_PIN_MIN_LENGTH) {
    throw new AppAuthError(
      "PIN_INVALID",
      `App PIN must be at least ${APP_PIN_MIN_LENGTH} characters`,
    );
  }
  if (pin.length > APP_PIN_MAX_LENGTH) {
    throw new AppAuthError(
      "PIN_INVALID",
      `App PIN must be at most ${APP_PIN_MAX_LENGTH} characters`,
    );
  }
}

export function resolvePinScryptParams(blob: PinWrappedKek): PinScryptParams {
  if (!blob.kdf) return { ...PIN_SCRYPT_LEGACY };
  const { N, r, p, dkLen } = blob.kdf;
  if (
    !Number.isInteger(N) ||
    !Number.isInteger(r) ||
    !Number.isInteger(p) ||
    !Number.isInteger(dkLen) ||
    N < 2 ||
    (N & (N - 1)) !== 0 ||
    r < 1 ||
    p < 1 ||
    dkLen < 16
  ) {
    throw new AppAuthError("UNKNOWN", "Corrupt PIN-wrapped KEK");
  }
  return { N, r, p, dkLen };
}

export function resolvePinKekVersion(blob: PinWrappedKek): number {
  if (blob.v === undefined) return 1;
  if (!Number.isInteger(blob.v) || blob.v < 1) {
    throw new AppAuthError("UNKNOWN", "Corrupt PIN-wrapped KEK");
  }
  return blob.v;
}

export function pinScryptParamsMatch(
  a: PinScryptParams,
  b: PinScryptParams = PIN_SCRYPT,
): boolean {
  return a.N === b.N && a.r === b.r && a.p === b.p && a.dkLen === b.dkLen;
}

export function needsPinKdfUpgrade(blob: PinWrappedKek): boolean {
  if (resolvePinKekVersion(blob) !== PIN_KEK_BLOB_VERSION) return true;
  return !pinScryptParamsMatch(resolvePinScryptParams(blob), PIN_SCRYPT);
}

export async function wrapKekWithPin(
  kekHex: string,
  pin: string,
  params: PinScryptParams = PIN_SCRYPT,
): Promise<PinWrappedKek> {
  validateAppPin(pin);
  const salt = getSecureRandomBytes(PIN_SALT_BYTES);
  const nonce = getSecureRandomBytes(PIN_NONCE_BYTES);
  const key = await derivePinScryptKey(textToBytes(pin), salt, params);
  const plaintext = hexToBytes(kekHex);
  if (plaintext.length !== 32) {
    throw new AppAuthError("UNKNOWN", "KEK must be 32 bytes");
  }
  const cipher = gcm(key, nonce, PIN_AAD);
  const ciphertext = cipher.encrypt(plaintext);
  return {
    saltB64: bytesToBase64(salt),
    nonceB64: bytesToBase64(nonce),
    ciphertextB64: bytesToBase64(ciphertext),
    kdf: { ...params },
    v: PIN_KEK_BLOB_VERSION,
  };
}

export async function unwrapKekWithPin(
  blob: PinWrappedKek,
  pin: string,
): Promise<string> {
  validateAppPin(pin);
  const salt = base64ToBytes(blob.saltB64);
  const nonce = base64ToBytes(blob.nonceB64);
  const ciphertext = base64ToBytes(blob.ciphertextB64);
  if (salt.length !== PIN_SALT_BYTES || nonce.length !== PIN_NONCE_BYTES) {
    throw new AppAuthError("UNKNOWN", "Corrupt PIN-wrapped KEK");
  }
  resolvePinKekVersion(blob); // validate if present
  const params = resolvePinScryptParams(blob);
  const key = await derivePinScryptKey(textToBytes(pin), salt, params);
  const cipher = gcm(key, nonce, PIN_AAD);
  try {
    const plaintext = cipher.decrypt(ciphertext);
    return bytesToHex(plaintext);
  } catch {
    throw new AppAuthError("AUTH_FAILED");
  }
}

export function serializePinWrappedKek(blob: PinWrappedKek): string {
  return JSON.stringify(blob);
}

export function parsePinWrappedKek(raw: string): PinWrappedKek {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AppAuthError("UNKNOWN", "Corrupt PIN-wrapped KEK");
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    typeof (parsed as PinWrappedKek).saltB64 !== "string" ||
    typeof (parsed as PinWrappedKek).nonceB64 !== "string" ||
    typeof (parsed as PinWrappedKek).ciphertextB64 !== "string"
  ) {
    throw new AppAuthError("UNKNOWN", "Corrupt PIN-wrapped KEK");
  }
  const blob = parsed as PinWrappedKek;
  if (blob.kdf !== undefined) {
    resolvePinScryptParams(blob); // validate
  }
  if (blob.v !== undefined) {
    resolvePinKekVersion(blob);
  }
  return blob;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function getSecureRandomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(out);
    return out;
  }
  throw new AppAuthError("UNKNOWN", "Secure random source is unavailable");
}
