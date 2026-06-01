import type { ApiClient } from "./api-client";
import type { UserSummaryDto } from "./api-types";

export class UsersApi {
  constructor(private readonly client: ApiClient) {}

  search(query: string): Promise<UserSummaryDto[]> {
    return this.client.get<UserSummaryDto[]>(
      `/users/search?q=${encodeURIComponent(query)}`,
    );
  }
}
