using Microsoft.AspNetCore.Hosting;
using System.Net;
using System.Net.Http.Json;

namespace GdotChat.Tests.Integration;

[Collection("RateLimit")]
public sealed class PreKeyBundleRateLimitTests
{
    private readonly RateLimitedWebApplicationFactory _factory;

    public PreKeyBundleRateLimitTests(RateLimitedWebApplicationFactory factory) =>
        _factory = factory;

    [Fact]
    public async Task PreKeyBundle_PerCallerLimit_Returns429()
    {
        // Fresh derived host so ASP.NET + custom limiter options apply cleanly.
        using var host = _factory.WithWebHostBuilder(b =>
        {
            b.UseSetting("RateLimits:PreKeyFetchCallerPermitLimit", "2");
            b.UseSetting("RateLimits:PreKeyFetchTargetPermitLimit", "100");
            b.UseSetting("RateLimits:PreKeyFetchCallerWindowSeconds", "3600");
            b.UseSetting("RateLimits:PreKeyFetchTargetWindowSeconds", "3600");
            b.UseSetting("RateLimits:AuthRefreshPermitLimit", int.MaxValue.ToString());
        });

        using var client = host.CreateClient();
        var target = await client.RegisterAsync(TestData.CreateRegisterRequest(oneTimePreKeyCount: 20));
        var caller = await client.RegisterAsync();
        using var callerClient = host.CreateClient();
        callerClient.SetBearer(caller.AccessToken);

        var path = $"/v1/users/{target.UserId}/devices/{target.DeviceId}/prekey-bundle";
        Assert.Equal(HttpStatusCode.OK, (await callerClient.GetAsync(path)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await callerClient.GetAsync(path)).StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, (await callerClient.GetAsync(path)).StatusCode);
    }

    [Fact]
    public async Task PreKeyBundle_PerTargetLimit_Returns429()
    {
        using var host = _factory.WithWebHostBuilder(b =>
        {
            b.UseSetting("RateLimits:PreKeyFetchCallerPermitLimit", "100");
            b.UseSetting("RateLimits:PreKeyFetchTargetPermitLimit", "2");
            b.UseSetting("RateLimits:PreKeyFetchCallerWindowSeconds", "3600");
            b.UseSetting("RateLimits:PreKeyFetchTargetWindowSeconds", "3600");
            b.UseSetting("RateLimits:AuthRefreshPermitLimit", int.MaxValue.ToString());
        });

        using var client = host.CreateClient();
        var target = await client.RegisterAsync(TestData.CreateRegisterRequest(oneTimePreKeyCount: 20));
        var callerA = await client.RegisterAsync();
        var callerB = await client.RegisterAsync();

        using var a = host.CreateClient();
        a.SetBearer(callerA.AccessToken);
        using var b = host.CreateClient();
        b.SetBearer(callerB.AccessToken);

        var path = $"/v1/users/{target.UserId}/devices/{target.DeviceId}/prekey-bundle";
        Assert.Equal(HttpStatusCode.OK, (await a.GetAsync(path)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await b.GetAsync(path)).StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, (await a.GetAsync(path)).StatusCode);
    }
}
