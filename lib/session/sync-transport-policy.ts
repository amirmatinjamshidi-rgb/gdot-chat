export type SyncTransportInput = {
  enableSignalR: boolean;
  signalRConnected: boolean;
  appInForeground: boolean;
  hasValidToken: boolean;
};

export type SyncTransportDecision = {
  /** Connect / keep SignalR while foregrounded with a valid token. */
  shouldConnectSignalR: boolean;
  /** Poll pending envelopes only when live push is unavailable. */
  shouldPoll: boolean;
};

/**
 * Pure policy for live sync vs poll fallback (unit-tested).
 * Polling runs only as a fallback while SignalR is disconnected (or disabled).
 */
export function decideSyncTransport(
  input: SyncTransportInput,
): SyncTransportDecision {
  if (!input.hasValidToken || !input.appInForeground) {
    return { shouldConnectSignalR: false, shouldPoll: false };
  }
  if (!input.enableSignalR) {
    return { shouldConnectSignalR: false, shouldPoll: true };
  }
  return {
    shouldConnectSignalR: true,
    shouldPoll: !input.signalRConnected,
  };
}
