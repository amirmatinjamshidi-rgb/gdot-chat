import * as signalR from "@microsoft/signalr";
import { Platform } from "react-native";

import { SIGNALR_HUB_URL } from "@/lib/config";
import { agentDebugLog } from "@/lib/debug-agent-log";
import type { AuthStore } from "@/lib/session/auth-store";

export type EnvelopeAvailableHandler = (envelopeId: string) => void;

export class SignalRClient {
  private connection: signalR.HubConnection | null = null;
  private onEnvelope: EnvelopeAvailableHandler | null = null;
  private connectInFlight: Promise<void> | null = null;

  constructor(private readonly authStore: AuthStore) {}

  setEnvelopeHandler(handler: EnvelopeAvailableHandler | null): void {
    this.onEnvelope = handler;
  }

  async connect(): Promise<void> {
    if (this.connection?.state === signalR.HubConnectionState.Connected) {
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
    if (this.connection?.state === signalR.HubConnectionState.Connected) {
      return;
    }

    const token = await this.authStore.getAccessToken();
    if (!token || token.startsWith("offline.")) {
      return;
    }

    const hubUrl = `${SIGNALR_HUB_URL}?access_token=${encodeURIComponent(token)}`;
    const builder = new signalR.HubConnectionBuilder()
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.None);

    // Long-polling holds HTTP connections and can starve fetch() on Android.
    if (Platform.OS === "web") {
      this.connection = builder.withUrl(hubUrl).build();
    } else {
      // #region agent log
      agentDebugLog(
        "signalr-client.ts:connectInner",
        "using websockets transport",
        { platform: Platform.OS },
        "K",
        "post-fix",
      );
      // #endregion
      this.connection = builder
        .withUrl(hubUrl, {
          transport: signalR.HttpTransportType.WebSockets,
          skipNegotiation: true,
        })
        .build();
    }

    this.connection.on(
      "EnvelopeAvailable",
      (payload: { envelopeId: string }) => {
        this.onEnvelope?.(payload.envelopeId);
      },
    );

    try {
      await this.connection.start();
    } catch {
      this.connection = null;
    }
  }

  async disconnect(): Promise<void> {
    await this.connection?.stop();
    this.connection = null;
  }

  async reconnect(): Promise<void> {
    await this.disconnect();
    await this.connect();
  }

  /** Free HTTP connections on native while critical REST calls run. */
  async runWithTransportPaused<T>(fn: () => Promise<T>): Promise<T> {
    const wasConnected =
      this.connection?.state === signalR.HubConnectionState.Connected;
    if (wasConnected) {
      // #region agent log
      agentDebugLog(
        "signalr-client.ts:runWithTransportPaused",
        "pausing signalr",
        {},
        "K",
        "post-fix",
      );
      // #endregion
      await this.disconnect();
    }
    try {
      return await fn();
    } finally {
      if (wasConnected) {
        // #region agent log
        agentDebugLog(
          "signalr-client.ts:runWithTransportPaused",
          "resuming signalr",
          {},
          "K",
          "post-fix",
        );
        // #endregion
        await this.connect();
      }
    }
  }
}
