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

let enrolled = false;
let level = SecurityLevel.NONE;

export async function hasHardwareAsync(): Promise<boolean> {
  return enrolled;
}

export async function isEnrolledAsync(): Promise<boolean> {
  return enrolled;
}

export async function getEnrolledLevelAsync(): Promise<number> {
  return level;
}

export async function supportedAuthenticationTypesAsync(): Promise<number[]> {
  return enrolled ? [AuthenticationType.FINGERPRINT] : [];
}

export async function authenticateAsync(_opts?: {
  promptMessage?: string;
}): Promise<{ success: boolean }> {
  return { success: enrolled };
}

export function __setBiometricStub(opts: {
  enrolled?: boolean;
  level?: number;
}): void {
  enrolled = opts.enrolled ?? false;
  level = opts.level ?? (enrolled ? SecurityLevel.BIOMETRIC_STRONG : SecurityLevel.NONE);
}

export function __resetBiometricStub(): void {
  enrolled = false;
  level = SecurityLevel.NONE;
}
