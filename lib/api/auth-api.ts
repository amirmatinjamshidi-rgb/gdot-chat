import type { ApiClient } from "./api-client";
import type { AuthResult, LoginRequest, RegisterRequest } from "./api-types";

export class AuthApi {
  constructor(private readonly client: ApiClient) {}

  register(body: RegisterRequest): Promise<AuthResult> {
    return this.client.post<AuthResult>("/auth/register", body);
  }

  login(body: LoginRequest): Promise<AuthResult> {
    return this.client.post<AuthResult>("/auth/login", body);
  }

  refresh(refreshToken: string): Promise<AuthResult> {
    return this.client.post<AuthResult>("/auth/refresh", { refreshToken });
  }
}
