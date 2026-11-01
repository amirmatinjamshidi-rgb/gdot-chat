/**
 * In-memory handoff when register/login needs an app PIN before KEK setup/unlock.
 * Cleared by takePendingAppPinAuth after the PIN screen consumes it.
 */
export type PendingAppPinAuth =
  | {
      kind: "register";
      username: string;
      password: string;
      deviceName: string;
    }
  | {
      kind: "login";
      username: string;
      password: string;
    };

let pending: PendingAppPinAuth | null = null;

export function setPendingAppPinAuth(value: PendingAppPinAuth): void {
  pending = value;
}

export function takePendingAppPinAuth(): PendingAppPinAuth | null {
  const value = pending;
  pending = null;
  return value;
}

export function peekPendingAppPinAuth(): PendingAppPinAuth | null {
  return pending;
}
