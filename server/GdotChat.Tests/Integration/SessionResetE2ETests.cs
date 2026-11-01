using System.Net;
using System.Net.Http.Json;
using GdotChat.Application.DTOs;
using Microsoft.AspNetCore.Hosting;

namespace GdotChat.Tests.Integration;

/// <summary>
/// E2E: fresh random users; session-reset signals are rate-limited per peer pair.
/// </summary>
[Collection("RateLimit")]
public sealed class SessionResetE2ETests
{
    private readonly RateLimitedWebApplicationFactory _factory;

    public SessionResetE2ETests(RateLimitedWebApplicationFactory factory) =>
        _factory = factory;

    [Fact]
    public async Task SessionReset_RateLimit_Returns429_AfterCap()
    {
        using var host = _factory.WithWebHostBuilder(b =>
        {
            b.UseSetting("RateLimits:SessionResetPermitLimit", "5");
            b.UseSetting("RateLimits:SessionResetWindowSeconds", "3600");
            b.UseSetting("RateLimits:AuthRefreshPermitLimit", int.MaxValue.ToString());
            b.UseSetting("RateLimits:PreKeyFetchCallerPermitLimit", int.MaxValue.ToString());
            b.UseSetting("RateLimits:PreKeyFetchTargetPermitLimit", int.MaxValue.ToString());
        });

        using var client = host.CreateClient();
        var caller = await client.RegisterAsync(TestData.CreateRegisterRequest());
        var peer = await client.RegisterAsync(TestData.CreateRegisterRequest());

        using var callerClient = host.CreateClient();
        callerClient.SetBearer(caller.AccessToken);

        for (var i = 0; i < 5; i++)
        {
            var ok = await callerClient.PostAsJsonAsync(
                "/v1/session-resets",
                new SessionResetRequest(peer.DeviceId));
            Assert.Equal(HttpStatusCode.NoContent, ok.StatusCode);
        }

        var limited = await callerClient.PostAsJsonAsync(
            "/v1/session-resets",
            new SessionResetRequest(peer.DeviceId));
        Assert.Equal(HttpStatusCode.TooManyRequests, limited.StatusCode);
    }
}
