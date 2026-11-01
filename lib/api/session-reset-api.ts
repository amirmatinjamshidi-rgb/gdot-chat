import type { ApiClient } from "./api-client";

export class SessionResetApi {
  constructor(private readonly client: ApiClient) {}

  /** Ask the peer device to drop its Signal session and rebuild from a fresh prekey bundle. */
  request(targetDeviceId: string): Promise<void> {
    return this.client.postPriority<void>("/session-resets", {
      targetDeviceId,
    });
  }
}
