using GdotChat.Application.DTOs;
using GdotChat.Application.Options;
using GdotChat.Infrastructure.Security;
using Microsoft.Extensions.Options;

namespace GdotChat.Tests.Integration;

public sealed class RefreshSuccessorProtectorTests
{
    [Fact]
    public void Protect_Unprotect_RoundTrips_RandomPayload()
    {
        var opts = Options.Create(new JwtOptions
        {
            SigningKey = $"test-key-{Guid.NewGuid():N}-pad-to-32chars!!",
        });
        var protector = new RefreshSuccessorProtector(opts);
        var dto = new AuthResultDto(
            AccessToken: $"access-{Guid.NewGuid():N}",
            RefreshToken: $"refresh-{Guid.NewGuid():N}",
            UserId: Guid.NewGuid(),
            DeviceId: Guid.NewGuid(),
            AccessTokenExpiresAt: DateTimeOffset.UtcNow.AddMinutes(15));

        var cipher = protector.Protect(dto);
        Assert.False(cipher.Contains(dto.RefreshToken, StringComparison.Ordinal));
        var round = protector.Unprotect(cipher);
        Assert.Equal(dto.AccessToken, round.AccessToken);
        Assert.Equal(dto.RefreshToken, round.RefreshToken);
        Assert.Equal(dto.UserId, round.UserId);
        Assert.Equal(dto.DeviceId, round.DeviceId);
        Assert.Equal(dto.AccessTokenExpiresAt, round.AccessTokenExpiresAt);
    }
}
