import { beforeEach, describe, expect, it, vi } from "vitest";

const start = vi.fn(async () => undefined);
const stop = vi.fn(async () => undefined);
let connectionState = 0;
const handlers = new Map<string, Function>();

vi.mock("@microsoft/signalr", () => {
  class HubConnectionBuilder {
    withUrl() {
      return this;
    }
    withAutomaticReconnect() {
      return this;
    }
    configureLogging() {
      return this;
    }
    build() {
      return {
        get state() {
          return connectionState;
        },
        start: async () => {
          await start();
          connectionState = 1;
        },
        stop: async () => {
          await stop();
          connectionState = 0;
        },
        on: (name: string, fn: Function) => handlers.set(name, fn),
        onreconnecting: (fn: Function) => handlers.set("reconnecting", fn),
        onreconnected: (fn: Function) => handlers.set("reconnected", fn),
        onclose: (fn: Function) => handlers.set("close", fn),
      };
    }
  }
  return {
    HubConnectionBuilder,
    HubConnectionState: { Connected: 1, Disconnected: 0 },
    LogLevel: { None: 0 },
    HttpTransportType: { WebSockets: 1 },
  };
});

vi.mock("@/lib/config", () => ({
  SIGNALR_HUB_URL: "http://api.test/hubs/messages",
}));

import { SignalRClient } from "@/lib/api/signalr-client";
import type { AuthStore } from "@/lib/session/auth-store";

describe("SignalRClient E2E reconnect pause", () => {
  beforeEach(() => {
    start.mockClear();
    stop.mockClear();
    connectionState = 0;
    handlers.clear();
  });

  it("runWithTransportPaused disconnects then reconnects", async () => {
    const client = new SignalRClient({
      getAccessToken: async () => `tok.${crypto.randomUUID()}`,
    } as unknown as AuthStore);
    await client.connect();
    expect(client.isConnected()).toBe(true);

    let ran = false;
    await client.runWithTransportPaused(async () => {
      ran = true;
      expect(client.isConnected()).toBe(false);
    });
    expect(ran).toBe(true);
    expect(client.isConnected()).toBe(true);
    expect(stop).toHaveBeenCalled();
    expect(start.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
