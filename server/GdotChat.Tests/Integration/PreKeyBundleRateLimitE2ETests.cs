using Microsoft.AspNetCore.Hosting;
using System.Net;

namespace GdotChat.Tests.Integration;

/// <summary>
/// E2E: two fresh users; caller exhausts configured per-caller prekey fetch budget.
/// </summary>
[Collection("RateLimit")]
public sealed class PreKeyBundleRateLimitE2ETests
{
    private readonly RateLimitedWebApplicationFactory _factory;

    public PreKeyBundleRateLimitE2ETests(RateLimitedWebApplicationFactory factory) =>
        _factory = factory;

    [Fact]
    public async Task TwoUserFlow_CallerLimitedIndependentlyOfTargetBudget()
    {
        using var host = _factory.WithWebHostBuilder(b =>
        {
            b.UseSetting("RateLimits:PreKeyFetchCallerPermitLimit", "1");
            b.UseSetting("RateLimits:PreKeyFetchTargetPermitLimit", "50");
            b.UseSetting("RateLimits:PreKeyFetchCallerWindowSeconds", "3600");
            b.UseSetting("RateLimits:PreKeyFetchTargetWindowSeconds", "3600");
            b.UseSetting("RateLimits:AuthRefreshPermitLimit", int.MaxValue.ToString());
        });

        using var client = host.CreateClient();
        var target = await client.RegisterAsync(TestData.CreateRegisterRequest(oneTimePreKeyCount: 10));
        var caller = await client.RegisterAsync();
        using var callerClient = host.CreateClient();
        callerClient.SetBearer(caller.AccessToken);

        var path = $"/v1/users/{target.UserId}/devices/{target.DeviceId}/prekey-bundle";
        Assert.Equal(HttpStatusCode.OK, (await callerClient.GetAsync(path)).StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, (await callerClient.GetAsync(path)).StatusCode);
    }
}
