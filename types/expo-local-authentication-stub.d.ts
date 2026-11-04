import "expo-local-authentication";

declare module "expo-local-authentication" {
  export function __setBiometricStub(opts: {
    enrolled?: boolean;
    level?: number;
    hasHardware?: boolean;
    authError?: string | null;
  }): void;
  export function __resetBiometricStub(): void;
  export function __getAuthenticateCallCount(): number;
}
