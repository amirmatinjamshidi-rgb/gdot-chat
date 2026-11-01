using System.Net;
using System.Net.Http.Json;
using GdotChat.Application.DTOs;
using GdotChat.Application.Interfaces;
using GdotChat.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace GdotChat.Tests.Integration;

[Collection("Integration")]
public sealed class AuthFlowTests
{
    private readonly HttpClient _client;
    private readonly GdotChatWebApplicationFactory _factory;

    public AuthFlowTests(GdotChatWebApplicationFactory factory)
    {
        _factory = factory;
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task Register_TwoUsers_ReturnsDistinctUserIds()
    {
        var first = await _client.RegisterAsync();
        var second = await _client.RegisterAsync();

        Assert.NotEqual(first.UserId, second.UserId);
        Assert.NotEqual(first.DeviceId, second.DeviceId);
    }

    [Fact]
    public async Task Login_WithValidCredentials_ReturnsTokens()
    {
        var username = TestData.UniqueUsername();
        var reg = await _client.RegisterAsync(TestData.CreateRegisterRequest(username));

        var loginResponse = await _client.PostAsJsonAsync(
            "/v1/auth/login",
            new LoginRequest(username, "password-123", reg.DeviceId));

        loginResponse.EnsureSuccessStatusCode();
        var login = await loginResponse.Content.ReadFromJsonAsync<AuthResultDto>();
        Assert.NotNull(login);
        Assert.Equal(reg.UserId, login.UserId);
        Assert.Equal(reg.DeviceId, login.DeviceId);
    }

    [Fact]
    public async Task Refresh_RotatesToken_AndRevokesOld()
    {
        var auth = await _client.RegisterAsync();
        var refreshResponse = await _client.PostAsJsonAsync(
            "/v1/auth/refresh",
            new RefreshRequest(auth.RefreshToken));

        refreshResponse.EnsureSuccessStatusCode();
        var refreshed = await refreshResponse.Content.ReadFromJsonAsync<AuthResultDto>();
        Assert.NotNull(refreshed);
        Assert.NotEqual(auth.RefreshToken, refreshed.RefreshToken);

        // Within reuse-grace: replaying the old refresh returns the same successor pair.
        var staleResponse = await _client.PostAsJsonAsync(
            "/v1/auth/refresh",
            new RefreshRequest(auth.RefreshToken));
        staleResponse.EnsureSuccessStatusCode();
        var replay = await staleResponse.Content.ReadFromJsonAsync<AuthResultDto>();
        Assert.NotNull(replay);
        Assert.Equal(refreshed.RefreshToken, replay.RefreshToken);
        Assert.Equal(refreshed.AccessToken, replay.AccessToken);

        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<DbContext>();
        var hash = scope.ServiceProvider
            .GetRequiredService<IJwtTokenService>()
            .HashRefreshToken(auth.RefreshToken);

        var stored = await db.Set<RefreshToken>()
            .FirstAsync(t => t.TokenHash == hash);

        Assert.NotNull(stored.RevokedAt);
        Assert.False(string.IsNullOrEmpty(stored.SuccessorCiphertext));
    }

    [Fact]
    public async Task Register_DuplicateUsername_Returns409()
    {
        var username = TestData.UniqueUsername();
        await _client.RegisterAsync(TestData.CreateRegisterRequest(username));

        var response = await _client.PostAsJsonAsync(
            "/v1/auth/register",
            TestData.CreateRegisterRequest(username));

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }
}
