import { gcm } from "@noble/ciphers/aes.js";
import { scrypt } from "@noble/hashes/scrypt.js";

import { AppAuthError } from "@/lib/auth/app-auth-error";
import { base64ToBytes, bytesToBase64, textToBytes } from "@/lib/crypto/encoding";
import { hexToBytes } from "@/lib/db/sql-utils";

/** Passphrase-style app PIN: min 8, max 128; letters/digits/symbols allowed. */
export const APP_PIN_MIN_LENGTH = 8;
export const APP_PIN_MAX_LENGTH = 128;

/**
 * scrypt parameters for PIN → wrap key.
 * N=2^15 balances mobile unlock latency vs offline guessing cost.
 */
export const PIN_SCRYPT = {
  N: 2 ** 15,
  r: 8,
  p: 1,
  dkLen: 32,
} as const;

export const PIN_SALT_BYTES = 16;
export const PIN_NONCE_BYTES = 12;

const PIN_AAD = textToBytes("gdot-pin-kek-v1");

export type PinWrappedKek = {
  saltB64: string;
  nonceB64: string;
  ciphertextB64: string;
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

export function wrapKekWithPin(kekHex: string, pin: string): PinWrappedKek {
  validateAppPin(pin);
  const salt = getSecureRandomBytes(PIN_SALT_BYTES);
  const nonce = getSecureRandomBytes(PIN_NONCE_BYTES);
  const key = derivePinKey(pin, salt);
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
  };
}

export function unwrapKekWithPin(blob: PinWrappedKek, pin: string): string {
  validateAppPin(pin);
  const salt = base64ToBytes(blob.saltB64);
  const nonce = base64ToBytes(blob.nonceB64);
  const ciphertext = base64ToBytes(blob.ciphertextB64);
  if (salt.length !== PIN_SALT_BYTES || nonce.length !== PIN_NONCE_BYTES) {
    throw new AppAuthError("UNKNOWN", "Corrupt PIN-wrapped KEK");
  }
  const key = derivePinKey(pin, salt);
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
  return parsed as PinWrappedKek;
}

function derivePinKey(pin: string, salt: Uint8Array): Uint8Array {
  return scrypt(textToBytes(pin), salt, {
    N: PIN_SCRYPT.N,
    r: PIN_SCRYPT.r,
    p: PIN_SCRYPT.p,
    dkLen: PIN_SCRYPT.dkLen,
  });
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
