import type { ApiClient } from "./api-client";
import type {
  AuthResult,
  LoginRequest,
  RegisterDevicePayload,
  RegisterRequest,
} from "./api-types";

export type LoginNewDeviceRequest = {
  username: string;
  password: string;
  device: RegisterDevicePayload;
};

export type RedeemDeviceLinkRequest = {
  token: string;
  device: RegisterDevicePayload;
};

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

  /** Preferred: redeem short-lived link token from an existing device. */
  redeemDeviceLink(body: RedeemDeviceLinkRequest): Promise<AuthResult> {
    return this.client.post<AuthResult>("/auth/device-link", body);
  }

  /**
   * Password fallback to register a new device on an existing account.
   * Prefer redeemDeviceLink; this path is rate-limited server-side.
   */
  loginNewDevice(body: LoginNewDeviceRequest): Promise<AuthResult> {
    return this.client.post<AuthResult>("/auth/login-new-device", body);
  }
}
