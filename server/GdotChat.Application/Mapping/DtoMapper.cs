using GdotChat.Application.DTOs;
using GdotChat.Domain.Entities;

namespace GdotChat.Application.Mapping;

public static class DtoMapper
{
    public static byte[] FromBase64(string b64) => Convert.FromBase64String(b64);

    public static string ToBase64(byte[] bytes) => Convert.ToBase64String(bytes);

    public static SignedPreKeyDto ToDto(SignedPreKey entity) =>
        new(entity.KeyId, ToBase64(entity.PublicKey), ToBase64(entity.Signature));

    public static OneTimePreKeyDto ToOtkDto(OneTimePreKey entity) =>
        new(entity.KeyId, ToBase64(entity.PublicKey));

    public static PreKeyBundleDto ToBundleDto(Device device, SignedPreKey spk, OneTimePreKey? otk) =>
        new(
            device.UserId,
            device.Id,
            device.RegistrationId,
            ToBase64(device.IdentityKeyPublic),
            ToDto(spk),
            otk is null ? null : ToOtkDto(otk));

    public static MessageEnvelopeDto ToDto(MessageEnvelope entity) =>
        new(
            entity.Id,
            entity.SenderDeviceId,
            entity.MessageType,
            ToBase64(entity.Ciphertext),
            entity.CreatedAt);

    public static UserSummaryDto ToDto(User user) => new(user.Id, user.Username);

    public static DeviceSummaryDto ToDto(Device device) =>
        new(device.Id, device.Name, device.RegistrationId);
}
