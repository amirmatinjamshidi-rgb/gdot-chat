import "expo-secure-store";

declare module "expo-secure-store" {
  export function __resetSecureStoreStub(): void;
  export function __setCanUseBiometricAuthentication(value: boolean): void;
  export function __getLastOptions(
    key: string,
  ):
    | {
        keychainAccessible?: number;
        requireAuthentication?: boolean;
        authenticationPrompt?: string;
        keychainService?: string;
      }
    | undefined;
}
