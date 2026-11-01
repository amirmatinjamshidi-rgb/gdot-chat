using Microsoft.AspNetCore.Hosting;
using System.Net;
using System.Net.Http.Json;
using GdotChat.Application.DTOs;

namespace GdotChat.Tests.Integration;

[Collection("RateLimit")]
public sealed class RefreshRateLimitE2ETests
{
    private readonly RateLimitedWebApplicationFactory _factory;

    public RefreshRateLimitE2ETests(RateLimitedWebApplicationFactory factory) =>
        _factory = factory;

    [Fact]
    public async Task RegisterThenRefreshUntilLimited_IsDeterministic()
    {
        const int limit = 3;
        using var host = _factory.WithWebHostBuilder(b =>
        {
            b.UseSetting("RateLimits:AuthRefreshPermitLimit", limit.ToString());
            b.UseSetting("RateLimits:AuthRefreshWindowSeconds", "3600");
            b.UseSetting("RateLimits:PreKeyFetchCallerPermitLimit", int.MaxValue.ToString());
            b.UseSetting("RateLimits:PreKeyFetchTargetPermitLimit", int.MaxValue.ToString());
        });

        using var client = host.CreateClient();
        var auth = await client.RegisterAsync();
        var token = auth.RefreshToken;
        var success = 0;
        var limited = false;

        for (var i = 0; i < limit + 5; i++)
        {
            var response = await client.PostAsJsonAsync(
                "/v1/auth/refresh",
                new RefreshRequest(token));
            if (response.StatusCode == HttpStatusCode.TooManyRequests)
            {
                limited = true;
                break;
            }

            response.EnsureSuccessStatusCode();
            success++;
            token = (await response.Content.ReadFromJsonAsync<AuthResultDto>())!.RefreshToken;
        }

        Assert.True(limited);
        Assert.Equal(limit, success);
    }
}
