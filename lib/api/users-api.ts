import type { ApiClient } from "./api-client";
import type { DeviceSummaryDto, UserSummaryDto } from "./api-types";

export class UsersApi {
  constructor(private readonly client: ApiClient) {}

  search(query: string, limit = 20): Promise<UserSummaryDto[]> {
    return this.client.get<UserSummaryDto[]>(
      `/users/search?q=${encodeURIComponent(query)}&limit=${limit}`,
    );
  }

  getProfile(userId: string): Promise<UserSummaryDto> {
    return this.client.get<UserSummaryDto>(`/users/${userId}`);
  }

  listDevices(userId: string): Promise<DeviceSummaryDto[]> {
    return this.client.get<DeviceSummaryDto[]>(`/users/${userId}/devices`);
  }
}
