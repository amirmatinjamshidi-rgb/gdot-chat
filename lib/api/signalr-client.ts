import * as signalR from "@microsoft/signalr";

import { SIGNALR_HUB_URL } from "@/lib/config";
import type { AuthStore } from "@/lib/session/auth-store";

export type EnvelopeAvailableHandler = (envelopeId: string) => void;

export class SignalRClient {
  private connection: signalR.HubConnection | null = null;
  private onEnvelope: EnvelopeAvailableHandler | null = null;

  constructor(private readonly authStore: AuthStore) {}

  setEnvelopeHandler(handler: EnvelopeAvailableHandler | null): void {
    this.onEnvelope = handler;
  }

  async connect(): Promise<void> {
    if (this.connection?.state === signalR.HubConnectionState.Connected) {
      return;
    }

    const token = await this.authStore.getAccessToken();
    if (!token || token.startsWith("offline.")) {
      return;
    }

    this.connection = new signalR.HubConnectionBuilder()
      .withUrl(`${SIGNALR_HUB_URL}?access_token=${encodeURIComponent(token)}`)
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.None)
      .build();

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
}
