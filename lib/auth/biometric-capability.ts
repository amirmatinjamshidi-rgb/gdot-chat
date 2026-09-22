import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";

import { AppAuthError, type AppAuthErrorCode } from "@/lib/auth/app-auth-error";

export type BiometricCapability = {
  hasHardware: boolean;
  enrolledLevel: LocalAuthentication.SecurityLevel;
  /** Android Keystore / SecureStore requireAuthentication needs Class 3 (Strong). */
  canUseStrongForSecureStore: boolean;
  hasStrongBiometric: boolean;
  /** Enrolled weak biometrics only (e.g. many Xiaomi 2D face unlock setups). */
  hasWeakOnly: boolean;
  /** Device PIN/pattern/password is available for LocalAuthentication fallback. */
  canOfferDeviceCredentialFallback: boolean;
};

export async function getBiometricCapability(): Promise<BiometricCapability> {
  const [hasHardware, enrolledLevel] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.getEnrolledLevelAsync(),
  ]);
  const canUseStrongForSecureStore = SecureStore.canUseBiometricAuthentication();
  const hasStrongBiometric =
    enrolledLevel >= LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG ||
    canUseStrongForSecureStore;
  const hasWeakOnly =
    enrolledLevel === LocalAuthentication.SecurityLevel.BIOMETRIC_WEAK &&
    !canUseStrongForSecureStore;
  const canOfferDeviceCredentialFallback =
    enrolledLevel >= LocalAuthentication.SecurityLevel.SECRET;

  return {
    hasHardware,
    enrolledLevel,
    canUseStrongForSecureStore,
    hasStrongBiometric,
    hasWeakOnly,
    canOfferDeviceCredentialFallback,
  };
}

/**
 * SecureStore requireAuthentication needs Strong biometrics. Call before
 * create/read of the KEK so Weak/face-only devices get a clear error.
 */
export async function assertStrongBiometricForSecureStore(): Promise<void> {
  const capability = await getBiometricCapability();
  if (capability.canUseStrongForSecureStore) return;

  if (capability.hasWeakOnly) {
    throw new AppAuthError("STRONG_BIOMETRIC_REQUIRED");
  }
  if (
    capability.enrolledLevel === LocalAuthentication.SecurityLevel.NONE ||
    !capability.hasHardware
  ) {
    throw new AppAuthError("NOT_ENROLLED");
  }
  if (
    capability.enrolledLevel === LocalAuthentication.SecurityLevel.SECRET &&
    !capability.canUseStrongForSecureStore
  ) {
    throw new AppAuthError("STRONG_BIOMETRIC_REQUIRED");
  }
  throw new AppAuthError("STRONG_BIOMETRIC_REQUIRED");
}

export async function authenticateWithDeviceFallback(
  promptMessage: string,
): Promise<void> {
  const capability = await getBiometricCapability();

  if (!capability.canUseStrongForSecureStore) {
    await assertStrongBiometricForSecureStore();
  }

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage,
    disableDeviceFallback: false,
    biometricsSecurityLevel: "strong",
    cancelLabel: "Cancel",
  });

  if (result.success) return;
  throw new AppAuthError(mapLocalAuthError(result.error));
}

function mapLocalAuthError(
  error: LocalAuthentication.LocalAuthenticationError,
): AppAuthErrorCode {
  switch (error) {
    case "user_cancel":
    case "system_cancel":
    case "app_cancel":
      return "USER_CANCEL";
    case "not_enrolled":
      return "NOT_ENROLLED";
    case "passcode_not_set":
      return "PASSCODE_NOT_SET";
    case "lockout":
      return "LOCKOUT";
    case "authentication_failed":
      return "AUTH_FAILED";
    case "user_fallback":
      // Device fallback UI should handle this; treat as cancel if it surfaces.
      return "USER_CANCEL";
    default:
      return "UNKNOWN";
  }
}

export function mapSecureStoreAuthError(error: unknown): AppAuthError {
  if (error instanceof AppAuthError) return error;

  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error);

  if (
    message.includes("cancel") ||
    message.includes("user canceled") ||
    message.includes("user cancelled")
  ) {
    return new AppAuthError("USER_CANCEL");
  }
  if (
    message.includes("no biometrics") ||
    message.includes("none_enrolled") ||
    message.includes("not_configured") ||
    message.includes("auth_not_configured")
  ) {
    return new AppAuthError("STRONG_BIOMETRIC_REQUIRED");
  }
  if (message.includes("lockout")) {
    return new AppAuthError("LOCKOUT");
  }
  if (message.includes("kek missing") || message.includes("kek_missing")) {
    return new AppAuthError("KEK_MISSING");
  }

  return new AppAuthError(
    "UNKNOWN",
    error instanceof Error ? error.message : undefined,
  );
}
