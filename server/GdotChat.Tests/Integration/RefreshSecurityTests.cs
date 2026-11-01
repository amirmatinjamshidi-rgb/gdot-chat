using System.Net;
using System.Net.Http.Json;
using GdotChat.Application.DTOs;
using GdotChat.Application.Interfaces;
using GdotChat.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace GdotChat.Tests.Integration;

[Collection("Integration")]
public sealed class RefreshSecurityTests
{
    private readonly HttpClient _client;
    private readonly GdotChatWebApplicationFactory _factory;

    public RefreshSecurityTests(GdotChatWebApplicationFactory factory)
    {
        _factory = factory;
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task Refresh_ConcurrentSameToken_IdempotentSameSuccessor()
    {
        var auth = await _client.RegisterAsync();
        var token = auth.RefreshToken;

        var tasks = Enumerable.Range(0, 8)
            .Select(_ => _client.PostAsJsonAsync("/v1/auth/refresh", new RefreshRequest(token)))
            .ToArray();

        var responses = await Task.WhenAll(tasks);
        var successes = responses.Where(r => r.IsSuccessStatusCode).ToList();
        Assert.NotEmpty(successes);

        var bodies = new List<AuthResultDto>();
        foreach (var r in successes)
            bodies.Add((await r.Content.ReadFromJsonAsync<AuthResultDto>())!);

        Assert.True(bodies.Select(b => b.RefreshToken).Distinct().Count() == 1);
        Assert.True(bodies.Select(b => b.AccessToken).Distinct().Count() == 1);

        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<DbContext>();
        var active = await db.Set<RefreshToken>()
            .CountAsync(t => t.DeviceId == auth.DeviceId && t.RevokedAt == null);
        Assert.Equal(1, active);
    }

    [Fact]
    public async Task Refresh_ReuseWithinGrace_ReturnsSameSuccessorPair()
    {
        var auth = await _client.RegisterAsync();
        var first = await _client.PostAsJsonAsync(
            "/v1/auth/refresh",
            new RefreshRequest(auth.RefreshToken));
        first.EnsureSuccessStatusCode();
        var rotated = (await first.Content.ReadFromJsonAsync<AuthResultDto>())!;

        var again = await _client.PostAsJsonAsync(
            "/v1/auth/refresh",
            new RefreshRequest(auth.RefreshToken));
        again.EnsureSuccessStatusCode();
        var replay = (await again.Content.ReadFromJsonAsync<AuthResultDto>())!;

        Assert.Equal(rotated.RefreshToken, replay.RefreshToken);
        Assert.Equal(rotated.AccessToken, replay.AccessToken);
        Assert.Equal(rotated.AccessTokenExpiresAt, replay.AccessTokenExpiresAt);
    }

    [Fact]
    public async Task Refresh_ReuseAfterGrace_RevokesFamily()
    {
        var auth = await _client.RegisterAsync();
        var firstRefresh = await _client.PostAsJsonAsync(
            "/v1/auth/refresh",
            new RefreshRequest(auth.RefreshToken));
        firstRefresh.EnsureSuccessStatusCode();
        var rotated = (await firstRefresh.Content.ReadFromJsonAsync<AuthResultDto>())!;

        // Backdate the revoked token past theft-grace without sleeping.
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<DbContext>();
            var jwt = scope.ServiceProvider.GetRequiredService<IJwtTokenService>();
            var hash = jwt.HashRefreshToken(auth.RefreshToken);
            var stored = await db.Set<RefreshToken>().FirstAsync(t => t.TokenHash == hash);
            stored.RevokedAt = DateTimeOffset.UtcNow.AddMinutes(-1);
            await db.SaveChangesAsync();
        }

        var reuse = await _client.PostAsJsonAsync(
            "/v1/auth/refresh",
            new RefreshRequest(auth.RefreshToken));
        Assert.Equal(HttpStatusCode.Unauthorized, reuse.StatusCode);

        var afterTheft = await _client.PostAsJsonAsync(
            "/v1/auth/refresh",
            new RefreshRequest(rotated.RefreshToken));
        Assert.Equal(HttpStatusCode.Unauthorized, afterTheft.StatusCode);

        await using var scope2 = _factory.Services.CreateAsyncScope();
        var db2 = scope2.ServiceProvider.GetRequiredService<DbContext>();
        var stillActive = await db2.Set<RefreshToken>()
            .CountAsync(t => t.DeviceId == auth.DeviceId && t.RevokedAt == null);
        Assert.Equal(0, stillActive);
    }
}
