import type { ApiClient } from "./api-client";
import type {
  DeviceSummaryDto,
  PreKeyBundleDto,
  UploadPreKeysRequest,
} from "./api-types";

export type CreateDeviceLinkTokenResponse = {
  token: string;
  expiresAt: string;
};

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

  listMyDevices(): Promise<DeviceSummaryDto[]> {
    return this.client.get<DeviceSummaryDto[]>(`/devices/me`);
  }

  createLinkToken(): Promise<CreateDeviceLinkTokenResponse> {
    return this.client.post<CreateDeviceLinkTokenResponse>(`/devices/link-tokens`);
  }
}
