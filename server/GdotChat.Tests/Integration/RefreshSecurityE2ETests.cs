using System.Net;
using System.Net.Http.Json;
using GdotChat.Application.DTOs;

namespace GdotChat.Tests.Integration;

/// <summary>
/// E2E multi-step: register → refresh chain → stale token rejected.
/// </summary>
[Collection("Integration")]
public sealed class RefreshSecurityE2ETests
{
    private readonly HttpClient _client;

    public RefreshSecurityE2ETests(GdotChatWebApplicationFactory factory) =>
        _client = factory.CreateClient();

    [Fact]
    public async Task RefreshChain_Works_AndOldTokenFailsImmediately()
    {
        var auth = await _client.RegisterAsync();

        var r1 = await _client.PostAsJsonAsync("/v1/auth/refresh", new RefreshRequest(auth.RefreshToken));
        r1.EnsureSuccessStatusCode();
        var t1 = (await r1.Content.ReadFromJsonAsync<AuthResultDto>())!;

        var r2 = await _client.PostAsJsonAsync("/v1/auth/refresh", new RefreshRequest(t1.RefreshToken));
        r2.EnsureSuccessStatusCode();
        var t2 = (await r2.Content.ReadFromJsonAsync<AuthResultDto>())!;
        Assert.NotEqual(t1.RefreshToken, t2.RefreshToken);

        var stale = await _client.PostAsJsonAsync("/v1/auth/refresh", new RefreshRequest(t1.RefreshToken));
        Assert.Equal(HttpStatusCode.Unauthorized, stale.StatusCode);
    }
}
