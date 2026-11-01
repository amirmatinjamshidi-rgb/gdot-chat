const store = new Map<string, string>();
const lastOptions = new Map<string, SecureStoreOptions | undefined>();

export const WHEN_UNLOCKED = 1;
export const WHEN_UNLOCKED_THIS_DEVICE_ONLY = 2;
export const AFTER_FIRST_UNLOCK = 3;
export const AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY = 4;
export const ALWAYS = 5;
export const ALWAYS_THIS_DEVICE_ONLY = 6;
export const WHEN_PASSCODE_SET_THIS_DEVICE_ONLY = 7;

export type SecureStoreOptions = {
  keychainAccessible?: number;
  requireAuthentication?: boolean;
  authenticationPrompt?: string;
  keychainService?: string;
};

export async function setItemAsync(
  key: string,
  value: string,
  options?: SecureStoreOptions,
): Promise<void> {
  lastOptions.set(key, options);
  store.set(key, value);
}

export async function getItemAsync(
  key: string,
  _options?: SecureStoreOptions,
): Promise<string | null> {
  return store.has(key) ? store.get(key)! : null;
}

export async function deleteItemAsync(
  key: string,
  _options?: SecureStoreOptions,
): Promise<void> {
  store.delete(key);
}

export function canUseBiometricAuthentication(): boolean {
  return false;
}

export async function isAvailableAsync(): Promise<boolean> {
  return true;
}

export function __resetSecureStoreStub(): void {
  store.clear();
  lastOptions.clear();
}

export function __getLastOptions(
  key: string,
): SecureStoreOptions | undefined {
  return lastOptions.get(key);
}
