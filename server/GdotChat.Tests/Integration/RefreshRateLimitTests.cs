using Microsoft.AspNetCore.Hosting;
using System.Net;
using System.Net.Http.Json;
using GdotChat.Application.DTOs;

namespace GdotChat.Tests.Integration;

[Collection("RateLimit")]
public sealed class RefreshRateLimitTests
{
    private readonly RateLimitedWebApplicationFactory _factory;

    public RefreshRateLimitTests(RateLimitedWebApplicationFactory factory) =>
        _factory = factory;

    [Fact]
    public async Task Refresh_ExceedsConfiguredLimit_Returns429()
    {
        const int limit = 2;
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

        HttpStatusCode? saw429 = null;
        for (var i = 0; i < limit + 3; i++)
        {
            var response = await client.PostAsJsonAsync(
                "/v1/auth/refresh",
                new RefreshRequest(token));
            if (response.StatusCode == HttpStatusCode.TooManyRequests)
            {
                saw429 = response.StatusCode;
                break;
            }

            if (!response.IsSuccessStatusCode)
                break;

            token = (await response.Content.ReadFromJsonAsync<AuthResultDto>())!.RefreshToken;
        }

        Assert.Equal(HttpStatusCode.TooManyRequests, saw429);
    }
}
