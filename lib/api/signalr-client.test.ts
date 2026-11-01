import { beforeEach, describe, expect, it, vi } from "vitest";

const start = vi.fn(async () => undefined);
const stop = vi.fn(async () => undefined);
const on = vi.fn();
const onreconnecting = vi.fn();
const onreconnected = vi.fn();
const onclose = vi.fn();

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
        state: 1, // Connected after start
        start,
        stop,
        on,
        onreconnecting,
        onreconnected,
        onclose,
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

import * as signalR from "@microsoft/signalr";
import { SignalRClient } from "@/lib/api/signalr-client";
import type { AuthStore } from "@/lib/session/auth-store";

function auth(token: string | null): AuthStore {
  return {
    getAccessToken: async () => token,
  } as unknown as AuthStore;
}

describe("SignalRClient", () => {
  beforeEach(() => {
    start.mockClear();
    stop.mockClear();
    on.mockClear();
  });

  it("connects with access token and registers handlers", async () => {
    const token = `tok.${crypto.randomUUID()}`;
    const client = new SignalRClient(auth(token));
    const envelopes: string[] = [];
    const states: boolean[] = [];
    client.setEnvelopeHandler((id) => envelopes.push(id));
    client.setConnectionHandler((c) => states.push(c));

    await client.connect();
    expect(start).toHaveBeenCalledTimes(1);
    expect(on).toHaveBeenCalledWith("EnvelopeAvailable", expect.any(Function));
    expect(on).toHaveBeenCalledWith("PreKeysLow", expect.any(Function));
    expect(on).toHaveBeenCalledWith(
      "SessionResetRequested",
      expect.any(Function),
    );
    expect(states.at(-1)).toBe(true);
    expect(client.isConnected()).toBe(true);

    const envelopeHandler = on.mock.calls.find(
      (c) => c[0] === "EnvelopeAvailable",
    )![1] as (p: { envelopeId: string }) => void;
    const id = crypto.randomUUID();
    envelopeHandler({ envelopeId: id });
    expect(envelopes).toEqual([id]);
  });

  it("skips connect when offline token", async () => {
    const client = new SignalRClient(auth("offline.local"));
    const states: boolean[] = [];
    client.setConnectionHandler((c) => states.push(c));
    await client.connect();
    expect(start).not.toHaveBeenCalled();
    expect(states.at(-1)).toBe(false);
  });

  it("disconnect stops hub and emits false", async () => {
    const client = new SignalRClient(auth(`t.${crypto.randomUUID()}`));
    await client.connect();
    const states: boolean[] = [];
    client.setConnectionHandler((c) => states.push(c));
    await client.disconnect();
    expect(stop).toHaveBeenCalled();
    expect(states.at(-1)).toBe(false);
  });
});
