import * as signalR from "@microsoft/signalr";
import { Platform } from "react-native";

import { SIGNALR_HUB_URL } from "@/lib/config";
import type { AuthStore } from "@/lib/session/auth-store";
import { isOfflineToken } from "@/lib/session/auth-store";

export type EnvelopeAvailableHandler = (envelopeId: string) => void;
export type SignalRConnectionHandler = (connected: boolean) => void;
export type PreKeysLowHandler = (remainingCount: number) => void;
export type SessionResetHandler = (fromDeviceId: string) => void;

/** Backoff for withAutomaticReconnect (ms). Final null stops retrying until manual connect. */
const RECONNECT_DELAYS_MS = [0, 2_000, 5_000, 10_000, 30_000];

export class SignalRClient {
  private connection: signalR.HubConnection | null = null;
  private onEnvelope: EnvelopeAvailableHandler | null = null;
  private onConnection: SignalRConnectionHandler | null = null;
  private onPreKeysLow: PreKeysLowHandler | null = null;
  private onSessionReset: SessionResetHandler | null = null;
  private connectInFlight: Promise<void> | null = null;
  /** When false, ignore automatic reconnect / don't auto-start (background / stop). */
  private desireConnected = false;

  constructor(private readonly authStore: AuthStore) {}

  setEnvelopeHandler(handler: EnvelopeAvailableHandler | null): void {
    this.onEnvelope = handler;
  }

  setConnectionHandler(handler: SignalRConnectionHandler | null): void {
    this.onConnection = handler;
  }

  setPreKeysLowHandler(handler: PreKeysLowHandler | null): void {
    this.onPreKeysLow = handler;
  }

  setSessionResetHandler(handler: SessionResetHandler | null): void {
    this.onSessionReset = handler;
  }

  isConnected(): boolean {
    return this.connection?.state === signalR.HubConnectionState.Connected;
  }

  async connect(): Promise<void> {
    this.desireConnected = true;
    if (this.connection?.state === signalR.HubConnectionState.Connected) {
      this.emitConnection(true);
      return;
    }
    if (this.connectInFlight) {
      return this.connectInFlight;
    }

    this.connectInFlight = this.connectInner().finally(() => {
      this.connectInFlight = null;
    });
    return this.connectInFlight;
  }

  private async connectInner(): Promise<void> {
    if (!this.desireConnected) return;
    if (this.connection?.state === signalR.HubConnectionState.Connected) {
      this.emitConnection(true);
      return;
    }

    const token = await this.authStore.getAccessToken();
    if (!token || isOfflineToken(token)) {
      this.emitConnection(false);
      return;
    }

    await this.disposeConnection();

    if (!this.desireConnected) return;

    const accessTokenFactory = async () => {
      const latest = await this.authStore.getAccessToken();
      return latest && !isOfflineToken(latest) ? latest : "";
    };

    // Prefer accessTokenFactory over embedding the JWT in a hand-built URL.
    // WebSockets still transmit the token as ?access_token= (browser/RN cannot
    // set Authorization on the WS handshake); the server only accepts that
    // query param on /hubs/* and request logging redacts it.
    const options: signalR.IHttpConnectionOptions = {
      accessTokenFactory,
    };

    const builder = new signalR.HubConnectionBuilder()
      .withAutomaticReconnect(RECONNECT_DELAYS_MS)
      .configureLogging(signalR.LogLevel.None);

    if (Platform.OS === "web") {
      this.connection = builder.withUrl(SIGNALR_HUB_URL, options).build();
    } else {
      this.connection = builder
        .withUrl(SIGNALR_HUB_URL, {
          ...options,
          transport: signalR.HttpTransportType.WebSockets,
          skipNegotiation: true,
        })
        .build();
    }

    this.connection.on("EnvelopeAvailable", (payload: { envelopeId: string }) => {
      this.onEnvelope?.(payload.envelopeId);
    });

    this.connection.on(
      "PreKeysLow",
      (payload: { remainingCount?: number; RemainingCount?: number }) => {
        const remaining =
          payload.remainingCount ?? payload.RemainingCount ?? 0;
        this.onPreKeysLow?.(remaining);
      },
    );

    this.connection.on(
      "SessionResetRequested",
      (payload: {
        fromDeviceId?: string;
        FromDeviceId?: string;
      }) => {
        const from = payload.fromDeviceId ?? payload.FromDeviceId;
        if (from) this.onSessionReset?.(from);
      },
    );

    this.connection.onreconnecting(() => {
      this.emitConnection(false);
    });

    this.connection.onreconnected(() => {
      if (!this.desireConnected) return;
      this.emitConnection(true);
    });

    this.connection.onclose(() => {
      this.emitConnection(false);
      // If we still want to be live (foreground) and auto-reconnect exhausted,
      // leave disconnected so SyncService poll fallback / next connect() can recover.
    });

    try {
      await this.connection.start();
      if (!this.desireConnected) {
        await this.disposeConnection();
        return;
      }
      this.emitConnection(true);
    } catch {
      await this.disposeConnection();
      this.emitConnection(false);
    }
  }

  async disconnect(): Promise<void> {
    this.desireConnected = false;
    await this.disposeConnection();
    this.emitConnection(false);
  }

  async reconnect(): Promise<void> {
    // Keep desireConnected true across a forced rebuild (e.g. token refresh).
    const want = this.desireConnected;
    await this.disposeConnection();
    this.emitConnection(false);
    if (want) {
      await this.connect();
    }
  }

  /** Free HTTP connections on native while critical REST calls run. */
  async runWithTransportPaused<T>(fn: () => Promise<T>): Promise<T> {
    const wasDesired = this.desireConnected;
    const wasConnected = this.isConnected();
    if (wasConnected || wasDesired) {
      await this.disconnect();
    }
    try {
      return await fn();
    } finally {
      if (wasDesired) {
        await this.connect();
      }
    }
  }

  private async disposeConnection(): Promise<void> {
    const conn = this.connection;
    this.connection = null;
    if (!conn) return;
    try {
      await conn.stop();
    } catch {
      /* noop */
    }
  }

  private emitConnection(connected: boolean): void {
    this.onConnection?.(connected);
  }
}
