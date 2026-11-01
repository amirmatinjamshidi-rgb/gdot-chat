using System.Security.Cryptography;
using System.Text;
using GdotChat.Application.DTOs;
using GdotChat.Application.Security;

namespace GdotChat.Tests.Integration;

internal sealed class DeviceKeyMaterial
{
    public required byte[] IdentityPrivateKey { get; init; }
    public required byte[] IdentityPublicKeyDjb { get; init; }
    public required int RegistrationId { get; init; }
    public required SignedPreKeyDto SignedPreKey { get; init; }
    public required List<OneTimePreKeyDto> OneTimePreKeys { get; init; }

    public string IdentityKeyPublicBase64 => Convert.ToBase64String(IdentityPublicKeyDjb);

    public SignedPreKeyDto CreateSignedPreKey(int keyId)
    {
        var spkPub = SignedPreKeySignature.GeneratePublicKeyDjb();
        var signature = SignedPreKeySignature.Sign(IdentityPrivateKey, spkPub);
        return new SignedPreKeyDto(keyId, Convert.ToBase64String(spkPub), Convert.ToBase64String(signature));
    }

    public OneTimePreKeyDto CreateOneTimePreKey(int keyId)
    {
        var pub = SignedPreKeySignature.GeneratePublicKeyDjb();
        return new OneTimePreKeyDto(keyId, Convert.ToBase64String(pub));
    }
}

internal static class TestData
{
    private static int _counter;

    public static string UniqueUsername() => $"user{Interlocked.Increment(ref _counter)}";

    public static (RegisterRequest Request, DeviceKeyMaterial Keys) CreateRegisterRequestWithKeys(
        string? username = null,
        int oneTimePreKeyCount = 100)
    {
        var (priv, pubDjb) = SignedPreKeySignature.GenerateIdentityKeyPair();
        var registrationId = RandomNumberGenerator.GetInt32(1, 0x3fff + 1);
        var keys = new DeviceKeyMaterial
        {
            IdentityPrivateKey = priv,
            IdentityPublicKeyDjb = pubDjb,
            RegistrationId = registrationId,
            SignedPreKey = default!,
            OneTimePreKeys = new List<OneTimePreKeyDto>(),
        };

        var spk = keys.CreateSignedPreKey(1);
        var otks = Enumerable.Range(1, oneTimePreKeyCount)
            .Select(i => keys.CreateOneTimePreKey(i))
            .ToList();

        keys = new DeviceKeyMaterial
        {
            IdentityPrivateKey = priv,
            IdentityPublicKeyDjb = pubDjb,
            RegistrationId = registrationId,
            SignedPreKey = spk,
            OneTimePreKeys = otks,
        };

        var request = new RegisterRequest(
            username ?? UniqueUsername(),
            "password-123",
            new RegisterDeviceRequest(
                "test-device",
                registrationId,
                keys.IdentityKeyPublicBase64,
                spk,
                otks));

        return (request, keys);
    }

    public static RegisterRequest CreateRegisterRequest(
        string? username = null,
        int oneTimePreKeyCount = 100)
        => CreateRegisterRequestWithKeys(username, oneTimePreKeyCount).Request;

    public static string B64(int byteLength) =>
        Convert.ToBase64String(RandomNumberGenerator.GetBytes(byteLength));
}
