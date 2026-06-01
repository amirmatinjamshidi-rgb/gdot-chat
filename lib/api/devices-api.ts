import type { ApiClient } from "./api-client";
import type { PreKeyBundleDto } from "./api-types";

export class DevicesApi {
  constructor(private readonly client: ApiClient) {}

  getPreKeyBundle(userId: string, deviceId: string): Promise<PreKeyBundleDto> {
    return this.client.get<PreKeyBundleDto>(
      `/users/${userId}/devices/${deviceId}/prekey-bundle`,
    );
  }
}
