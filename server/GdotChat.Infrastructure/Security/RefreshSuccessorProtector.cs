using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using GdotChat.Application.DTOs;
using GdotChat.Application.Interfaces;
using GdotChat.Application.Options;
using Microsoft.Extensions.Options;

namespace GdotChat.Infrastructure.Security;

public sealed class RefreshSuccessorProtector : IRefreshSuccessorProtector
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    private readonly byte[] _key;

    public RefreshSuccessorProtector(IOptions<JwtOptions> jwtOptions)
    {
        var material = jwtOptions.Value.SigningKey
            ?? throw new InvalidOperationException("Jwt:SigningKey is required for refresh successor protection.");
        _key = SHA256.HashData(Encoding.UTF8.GetBytes("gdot-refresh-successor-v1:" + material));
    }

    public string Protect(AuthResultDto result)
    {
        var payload = JsonSerializer.Serialize(result, JsonOptions);
        var plain = Encoding.UTF8.GetBytes(payload);
        var nonce = RandomNumberGenerator.GetBytes(12);
        var cipher = new byte[plain.Length];
        var tag = new byte[16];
        using var aes = new AesGcm(_key, 16);
        aes.Encrypt(nonce, plain, cipher, tag);

        var packed = new byte[nonce.Length + tag.Length + cipher.Length];
        Buffer.BlockCopy(nonce, 0, packed, 0, nonce.Length);
        Buffer.BlockCopy(tag, 0, packed, nonce.Length, tag.Length);
        Buffer.BlockCopy(cipher, 0, packed, nonce.Length + tag.Length, cipher.Length);
        return Convert.ToBase64String(packed);
    }

    public AuthResultDto Unprotect(string ciphertext)
    {
        var packed = Convert.FromBase64String(ciphertext);
        if (packed.Length < 12 + 16 + 1)
            throw new CryptographicException("Corrupt successor payload.");

        var nonce = packed.AsSpan(0, 12);
        var tag = packed.AsSpan(12, 16);
        var cipher = packed.AsSpan(28);
        var plain = new byte[cipher.Length];
        using var aes = new AesGcm(_key, 16);
        aes.Decrypt(nonce, cipher, tag, plain);
        var json = Encoding.UTF8.GetString(plain);
        return JsonSerializer.Deserialize<AuthResultDto>(json, JsonOptions)
            ?? throw new CryptographicException("Corrupt successor payload.");
    }
}
