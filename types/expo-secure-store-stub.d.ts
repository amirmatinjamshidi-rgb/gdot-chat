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
  export function __getGetCalls(): {
    key: string;
    options?: {
      keychainAccessible?: number;
      requireAuthentication?: boolean;
      authenticationPrompt?: string;
      keychainService?: string;
    };
  }[];
  export function __getSetCalls(): {
    key: string;
    options?: {
      keychainAccessible?: number;
      requireAuthentication?: boolean;
      authenticationPrompt?: string;
      keychainService?: string;
    };
  }[];
  export function __clearCallLog(): void;
}
