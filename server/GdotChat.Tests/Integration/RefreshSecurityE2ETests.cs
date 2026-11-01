using System.Net;
using System.Net.Http.Json;
using GdotChat.Application.DTOs;
using GdotChat.Application.Interfaces;
using GdotChat.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace GdotChat.Tests.Integration;

/// <summary>
/// E2E multi-step: register → refresh chain → within-grace idempotent → after-grace theft.
/// </summary>
[Collection("Integration")]
public sealed class RefreshSecurityE2ETests
{
    private readonly HttpClient _client;
    private readonly GdotChatWebApplicationFactory _factory;

    public RefreshSecurityE2ETests(GdotChatWebApplicationFactory factory)
    {
        _factory = factory;
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task RefreshChain_IdempotentWithinGrace_ThenTheftAfterGrace()
    {
        var auth = await _client.RegisterAsync();

        var r1 = await _client.PostAsJsonAsync("/v1/auth/refresh", new RefreshRequest(auth.RefreshToken));
        r1.EnsureSuccessStatusCode();
        var t1 = (await r1.Content.ReadFromJsonAsync<AuthResultDto>())!;

        var r2 = await _client.PostAsJsonAsync("/v1/auth/refresh", new RefreshRequest(t1.RefreshToken));
        r2.EnsureSuccessStatusCode();
        var t2 = (await r2.Content.ReadFromJsonAsync<AuthResultDto>())!;
        Assert.NotEqual(t1.RefreshToken, t2.RefreshToken);

        // Within grace: replaying t1 returns the same successor as r2 (t2).
        var staleWithinGrace = await _client.PostAsJsonAsync("/v1/auth/refresh", new RefreshRequest(t1.RefreshToken));
        staleWithinGrace.EnsureSuccessStatusCode();
        var replay = (await staleWithinGrace.Content.ReadFromJsonAsync<AuthResultDto>())!;
        Assert.Equal(t2.RefreshToken, replay.RefreshToken);
        Assert.Equal(t2.AccessToken, replay.AccessToken);

        // Past grace: theft → family revoked (injected clock via backdated RevokedAt).
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<DbContext>();
            var jwt = scope.ServiceProvider.GetRequiredService<IJwtTokenService>();
            var hash = jwt.HashRefreshToken(t1.RefreshToken);
            var stored = await db.Set<RefreshToken>().FirstAsync(t => t.TokenHash == hash);
            stored.RevokedAt = DateTimeOffset.UtcNow.AddMinutes(-1);
            await db.SaveChangesAsync();
        }

        var stolen = await _client.PostAsJsonAsync("/v1/auth/refresh", new RefreshRequest(t1.RefreshToken));
        Assert.Equal(HttpStatusCode.Unauthorized, stolen.StatusCode);

        var successorDead = await _client.PostAsJsonAsync("/v1/auth/refresh", new RefreshRequest(t2.RefreshToken));
        Assert.Equal(HttpStatusCode.Unauthorized, successorDead.StatusCode);
    }
}
