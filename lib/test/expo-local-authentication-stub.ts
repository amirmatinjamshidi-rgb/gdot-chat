export const AuthenticationType = {
  FINGERPRINT: 1,
  FACIAL_RECOGNITION: 2,
  IRIS: 3,
};

export const SecurityLevel = {
  NONE: 0,
  SECRET: 1,
  BIOMETRIC_WEAK: 2,
  BIOMETRIC_STRONG: 3,
};

let hasHardware = false;
let enrolled = false;
let level = SecurityLevel.NONE;
let authError: string | null = null;

export async function hasHardwareAsync(): Promise<boolean> {
  return hasHardware;
}

export async function isEnrolledAsync(): Promise<boolean> {
  return enrolled;
}

export async function getEnrolledLevelAsync(): Promise<number> {
  return level;
}

export async function supportedAuthenticationTypesAsync(): Promise<number[]> {
  return hasHardware ? [AuthenticationType.FINGERPRINT] : [];
}

export async function authenticateAsync(_opts?: {
  promptMessage?: string;
  disableDeviceFallback?: boolean;
  biometricsSecurityLevel?: string;
  cancelLabel?: string;
}): Promise<{ success: boolean; error?: string }> {
  if (authError) {
    return { success: false, error: authError };
  }
  return { success: enrolled };
}

export function __setBiometricStub(opts: {
  enrolled?: boolean;
  level?: number;
  hasHardware?: boolean;
  authError?: string | null;
}): void {
  enrolled = opts.enrolled ?? false;
  level =
    opts.level ??
    (enrolled ? SecurityLevel.BIOMETRIC_STRONG : SecurityLevel.NONE);
  hasHardware = opts.hasHardware ?? (enrolled || level > SecurityLevel.NONE);
  authError = opts.authError ?? null;
}

export function __resetBiometricStub(): void {
  hasHardware = false;
  enrolled = false;
  level = SecurityLevel.NONE;
  authError = null;
}
