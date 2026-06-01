namespace GdotChat.Application.DTOs;

public record SignedPreKeyDto(int KeyId, string PublicKeyBase64, string SignatureBase64);

public record OneTimePreKeyDto(int KeyId, string PublicKeyBase64);

public record UploadPreKeysRequest(
    SignedPreKeyDto SignedPreKey,
    IReadOnlyList<OneTimePreKeyDto> OneTimePreKeys);

public record PreKeyBundleDto(
    Guid UserId,
    Guid DeviceId,
    int RegistrationId,
    string IdentityKeyPublicBase64,
    SignedPreKeyDto SignedPreKey,
    OneTimePreKeyDto? OneTimePreKey);

public record DeviceSummaryDto(Guid DeviceId, string Name, int RegistrationId);
