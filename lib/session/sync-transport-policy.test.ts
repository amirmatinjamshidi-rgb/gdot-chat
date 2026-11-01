import { describe, expect, test } from "vitest";
import { decideSyncTransport } from "./sync-transport-policy";

describe("decideSyncTransport", () => {
  test("polls when SignalR disabled and app is active", () => {
    expect(
      decideSyncTransport({
        enableSignalR: false,
        signalRConnected: false,
        appInForeground: true,
        hasValidToken: true,
      }),
    ).toEqual({ shouldConnectSignalR: false, shouldPoll: true });
  });

  test("uses SignalR only (no poll) when connected", () => {
    expect(
      decideSyncTransport({
        enableSignalR: true,
        signalRConnected: true,
        appInForeground: true,
        hasValidToken: true,
      }),
    ).toEqual({ shouldConnectSignalR: true, shouldPoll: false });
  });

  test("polls as fallback while SignalR is down", () => {
    expect(
      decideSyncTransport({
        enableSignalR: true,
        signalRConnected: false,
        appInForeground: true,
        hasValidToken: true,
      }),
    ).toEqual({ shouldConnectSignalR: true, shouldPoll: true });
  });

  test("stops connect and poll in background", () => {
    expect(
      decideSyncTransport({
        enableSignalR: true,
        signalRConnected: true,
        appInForeground: false,
        hasValidToken: true,
      }),
    ).toEqual({ shouldConnectSignalR: false, shouldPoll: false });
  });

  test("stops everything without a valid token", () => {
    expect(
      decideSyncTransport({
        enableSignalR: true,
        signalRConnected: false,
        appInForeground: true,
        hasValidToken: false,
      }),
    ).toEqual({ shouldConnectSignalR: false, shouldPoll: false });
  });
});
