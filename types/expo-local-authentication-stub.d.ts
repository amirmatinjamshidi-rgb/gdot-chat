import "expo-local-authentication";

declare module "expo-local-authentication" {
  export function __setBiometricStub(opts: {
    enrolled?: boolean;
    level?: number;
  }): void;
  export function __resetBiometricStub(): void;
}
