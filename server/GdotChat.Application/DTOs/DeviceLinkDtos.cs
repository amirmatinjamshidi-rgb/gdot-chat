namespace GdotChat.Application.DTOs;

public record CreateDeviceLinkTokenResponse(string Token, DateTimeOffset ExpiresAt);

public record RedeemDeviceLinkRequest(string Token, RegisterDeviceRequest Device);

public record LoginNewDeviceRequest(
    string Username,
    string Password,
    RegisterDeviceRequest Device);

public record PreKeyBundleListItemDto(Guid DeviceId, string DeviceName, PreKeyBundleDto? Bundle);

public record UserDevicesPreKeyBundlesDto(
    Guid UserId,
    IReadOnlyList<DeviceSummaryDto> Devices);
