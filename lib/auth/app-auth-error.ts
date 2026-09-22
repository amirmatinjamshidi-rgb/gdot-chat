export type AppAuthErrorCode =
  | "STRONG_BIOMETRIC_REQUIRED"
  | "NOT_ENROLLED"
  | "PASSCODE_NOT_SET"
  | "USER_CANCEL"
  | "LOCKOUT"
  | "AUTH_FAILED"
  | "KEK_MISSING"
  | "UNKNOWN";

const MESSAGES: Record<AppAuthErrorCode, string> = {
  STRONG_BIOMETRIC_REQUIRED:
    "This phone needs a fingerprint (or another Strong / Class 3 biometric) to protect your encrypted database. Face unlock alone is not enough on many Xiaomi/MIUI devices. Enroll a fingerprint in system settings, then try again.",
  NOT_ENROLLED:
    "No biometrics are enrolled. Add a fingerprint in your phone settings, then try again.",
  PASSCODE_NOT_SET:
    "Set a device PIN, pattern, or password in system settings before unlocking.",
  USER_CANCEL: "Authentication canceled.",
  LOCKOUT:
    "Too many failed attempts. Wait a moment, or unlock with your device PIN/pattern/password, then try again.",
  AUTH_FAILED: "Authentication failed. Try again with fingerprint or device PIN.",
  KEK_MISSING:
    "Encrypted database key is missing. Sign out and register again on this device.",
  UNKNOWN: "Could not authenticate. Try again.",
};

export class AppAuthError extends Error {
  constructor(public readonly code: AppAuthErrorCode, message?: string) {
    super(message ?? MESSAGES[code]);
    this.name = "AppAuthError";
  }
}

export function messageForAppAuthCode(code: AppAuthErrorCode): string {
  return MESSAGES[code];
}

export function isUserCancelAuth(error: unknown): boolean {
  return error instanceof AppAuthError && error.code === "USER_CANCEL";
}
