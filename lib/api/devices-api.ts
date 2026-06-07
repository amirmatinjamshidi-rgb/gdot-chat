import type { ApiClient } from "./api-client";
import type { PreKeyBundleDto, UploadPreKeysRequest } from "./api-types";

export class DevicesApi {
  constructor(private readonly client: ApiClient) {}

  getPreKeyBundle(userId: string, deviceId: string): Promise<PreKeyBundleDto> {
    return this.client.getPriority<PreKeyBundleDto>(
      `/users/${userId}/devices/${deviceId}/prekey-bundle`,
    );
  }

  uploadPreKeys(
    deviceId: string,
    body: UploadPreKeysRequest,
  ): Promise<void> {
    return this.client.put<void>(`/devices/${deviceId}/prekeys`, body);
  }
}
