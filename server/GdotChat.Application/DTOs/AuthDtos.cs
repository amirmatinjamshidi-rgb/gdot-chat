namespace GdotChat.Application.DTOs;

public record RegisterRequest(string Username, string Password, RegisterDeviceRequest Device);

public record RegisterDeviceRequest(
    string DeviceName,
    int RegistrationId,
    string IdentityKeyPublicBase64,
    SignedPreKeyDto SignedPreKey,
    IReadOnlyList<OneTimePreKeyDto> OneTimePreKeys);

public record LoginRequest(string Username, string Password, Guid DeviceId);

public record RefreshRequest(string RefreshToken);

public record AuthResultDto(
    string AccessToken,
    string RefreshToken,
    Guid UserId,
    Guid DeviceId,
    DateTimeOffset AccessTokenExpiresAt);
