using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using GdotChat.Application.DTOs;
using GdotChat.Application.Interfaces;
using GdotChat.Application.Security;
using GdotChat.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace GdotChat.Tests.Integration;

[Collection("Integration")]
public sealed class JwtScopeTests
{
    private readonly GdotChatWebApplicationFactory _factory;
    private readonly HttpClient _client;

    public JwtScopeTests(GdotChatWebApplicationFactory factory)
    {
        _factory = factory;
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task LoginToken_IncludesAllUserScopes()
    {
        var auth = await _client.RegisterAsync(TestData.CreateRegisterRequest(oneTimePreKeyCount: 2));
        var handler = new JwtSecurityTokenHandler();
        var jwt = handler.ReadJwtToken(auth.AccessToken);
        var scope = jwt.Claims.First(c => c.Type == AuthScopes.ClaimType).Value;
        foreach (var expected in AuthScopes.AllUserScopes)
            Assert.Contains(expected, AuthScopes.Parse(scope));
    }

    [Fact]
    public async Task MessagesSend_WithoutMessagesScope_Returns403()
    {
        var (reg, _) = TestData.CreateRegisterRequestWithKeys(oneTimePreKeyCount: 2);
        var auth = await _client.RegisterAsync(reg);
        var limited = await MintScopedTokenAsync(auth.UserId, auth.DeviceId, [AuthScopes.Users]);

        using var http = _factory.CreateClient();
        http.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", limited);

        var peer = await _client.RegisterAsync(TestData.CreateRegisterRequest(oneTimePreKeyCount: 2));
        var body = new SendMessageRequest(
            peer.UserId,
            peer.DeviceId,
            3,
            TestData.B64(64));
        var response = await http.PostAsJsonAsync("/v1/messages", body);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task PrekeyUpload_WithoutPrekeysScope_Returns403()
    {
        var (reg, keys) = TestData.CreateRegisterRequestWithKeys(oneTimePreKeyCount: 2);
        var auth = await _client.RegisterAsync(reg);
        var limited = await MintScopedTokenAsync(auth.UserId, auth.DeviceId, [AuthScopes.Messages]);

        using var http = _factory.CreateClient();
        http.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", limited);

        var upload = new UploadPreKeysRequest(
            keys.CreateSignedPreKey(9),
            new List<OneTimePreKeyDto> { keys.CreateOneTimePreKey(9001) });
        var response = await http.PutAsJsonAsync($"/v1/devices/{auth.DeviceId}/prekeys", upload);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task SessionReset_WithoutSessionScope_Returns403()
    {
        var auth = await _client.RegisterAsync(TestData.CreateRegisterRequest(oneTimePreKeyCount: 2));
        var peer = await _client.RegisterAsync(TestData.CreateRegisterRequest(oneTimePreKeyCount: 2));
        var limited = await MintScopedTokenAsync(auth.UserId, auth.DeviceId, [AuthScopes.Messages]);

        using var http = _factory.CreateClient();
        http.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", limited);
        var response = await http.PostAsJsonAsync(
            "/v1/session-resets",
            new SessionResetRequest(peer.DeviceId));
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    private async Task<string> MintScopedTokenAsync(
        Guid userId,
        Guid deviceId,
        IReadOnlyCollection<string> scopes)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<DbContext>();
        var jwt = scope.ServiceProvider.GetRequiredService<IJwtTokenService>();
        var user = await db.Set<User>().FirstAsync(u => u.Id == userId);
        var device = await db.Set<Device>().FirstAsync(d => d.Id == deviceId);
        return jwt.CreateAccessToken(user, device, scopes);
    }
}
