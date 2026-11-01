/**
 * Stable Signal Protocol address name for a peer device.
 * Uses userId + deviceId so sessions are per-device (not collapsed onto DEVICE_ID=1).
 */
export function protocolAddressId(
  peerUserId: string,
  peerDeviceId: string,
): string {
  return `${peerUserId}:${peerDeviceId}`;
}

/** Session store key matching SignalProtocolAddress.toString() with device id 1. */
export function sessionStoreKey(
  peerUserId: string,
  peerDeviceId: string,
): string {
  return `${protocolAddressId(peerUserId, peerDeviceId)}.1`;
}

/** Libsignal still requires a numeric device id; real device identity lives in the name. */
export const SIGNAL_ADDRESS_DEVICE_ID = 1;
