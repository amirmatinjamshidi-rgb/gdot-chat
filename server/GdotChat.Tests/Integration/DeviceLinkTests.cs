using System.Net;
using System.Net.Http.Json;
using GdotChat.Application.DTOs;

namespace GdotChat.Tests.Integration;

[Collection("Integration")]
public sealed class DeviceLinkTests
{
    private readonly GdotChatWebApplicationFactory _factory;
    private readonly HttpClient _client;

    public DeviceLinkTests(GdotChatWebApplicationFactory factory)
    {
        _factory = factory;
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task LinkToken_Redeem_AddsSecondDevice_AndListsBoth()
    {
        var username = TestData.UniqueUsername();
        var (regReq, _) = TestData.CreateRegisterRequestWithKeys(username, oneTimePreKeyCount: 5);
        var first = await _client.RegisterAsync(regReq);

        using var existing = _factory.CreateClient();
        existing.SetBearer(first.AccessToken);

        var tokenResponse = await existing.PostAsync("/v1/devices/link-tokens", null);
        tokenResponse.EnsureSuccessStatusCode();
        var link = await tokenResponse.Content.ReadFromJsonAsync<CreateDeviceLinkTokenResponse>();
        Assert.NotNull(link);
        Assert.False(string.IsNullOrWhiteSpace(link.Token));

        var (secondDeviceReq, _) = TestData.CreateRegisterRequestWithKeys(oneTimePreKeyCount: 5);
        using var anonymous = _factory.CreateClient();
        var redeemResponse = await anonymous.PostAsJsonAsync(
            "/v1/auth/device-link",
            new RedeemDeviceLinkRequest(link.Token, secondDeviceReq.Device));
        redeemResponse.EnsureSuccessStatusCode();
        var second = await redeemResponse.Content.ReadFromJsonAsync<AuthResultDto>();
        Assert.NotNull(second);
        Assert.Equal(first.UserId, second.UserId);
        Assert.NotEqual(first.DeviceId, second.DeviceId);

        var listResponse = await existing.GetAsync("/v1/devices/me");
        listResponse.EnsureSuccessStatusCode();
        var devices = await listResponse.Content.ReadFromJsonAsync<List<DeviceSummaryDto>>();
        Assert.NotNull(devices);
        Assert.Equal(2, devices.Count);
        Assert.Contains(devices, d => d.DeviceId == first.DeviceId);
        Assert.Contains(devices, d => d.DeviceId == second.DeviceId);
    }

    [Fact]
    public async Task LoginNewDevice_PasswordFallback_CreatesDistinctDevice()
    {
        var username = TestData.UniqueUsername();
        var first = await _client.RegisterAsync(TestData.CreateRegisterRequest(username, oneTimePreKeyCount: 5));

        var (secondReq, _) = TestData.CreateRegisterRequestWithKeys(oneTimePreKeyCount: 5);
        using var anonymous = _factory.CreateClient();
        var response = await anonymous.PostAsJsonAsync(
            "/v1/auth/login-new-device",
            new LoginNewDeviceRequest(username, "password-123", secondReq.Device));
        response.EnsureSuccessStatusCode();
        var second = await response.Content.ReadFromJsonAsync<AuthResultDto>();
        Assert.NotNull(second);
        Assert.Equal(first.UserId, second.UserId);
        Assert.NotEqual(first.DeviceId, second.DeviceId);
    }

    [Fact]
    public async Task PreKeyBundle_PerDevice_FetchesDistinctBundles()
    {
        var username = TestData.UniqueUsername();
        var first = await _client.RegisterAsync(TestData.CreateRegisterRequest(username, oneTimePreKeyCount: 8));
        var (secondReq, _) = TestData.CreateRegisterRequestWithKeys(oneTimePreKeyCount: 8);
        using var anon = _factory.CreateClient();
        var secondResp = await anon.PostAsJsonAsync(
            "/v1/auth/login-new-device",
            new LoginNewDeviceRequest(username, "password-123", secondReq.Device));
        secondResp.EnsureSuccessStatusCode();
        var second = await secondResp.Content.ReadFromJsonAsync<AuthResultDto>();
        Assert.NotNull(second);

        var caller = await _client.RegisterAsync(TestData.CreateRegisterRequest(oneTimePreKeyCount: 3));
        using var callerClient = _factory.CreateClient();
        callerClient.SetBearer(caller.AccessToken);

        var b1 = await callerClient.GetAsync(
            $"/v1/users/{first.UserId}/devices/{first.DeviceId}/prekey-bundle");
        b1.EnsureSuccessStatusCode();
        var bundle1 = await b1.Content.ReadFromJsonAsync<PreKeyBundleDto>();
        Assert.NotNull(bundle1);
        Assert.Equal(first.DeviceId, bundle1.DeviceId);

        var b2 = await callerClient.GetAsync(
            $"/v1/users/{second.UserId}/devices/{second.DeviceId}/prekey-bundle");
        b2.EnsureSuccessStatusCode();
        var bundle2 = await b2.Content.ReadFromJsonAsync<PreKeyBundleDto>();
        Assert.NotNull(bundle2);
        Assert.Equal(second.DeviceId, bundle2.DeviceId);
        Assert.NotEqual(bundle1.IdentityKeyPublicBase64, bundle2.IdentityKeyPublicBase64);

        var list = await callerClient.GetAsync($"/v1/users/{first.UserId}/devices");
        list.EnsureSuccessStatusCode();
        var devices = await list.Content.ReadFromJsonAsync<List<DeviceSummaryDto>>();
        Assert.NotNull(devices);
        Assert.Equal(2, devices.Count);
    }

    [Fact]
    public async Task Redeem_InvalidToken_Returns400()
    {
        var (deviceReq, _) = TestData.CreateRegisterRequestWithKeys(oneTimePreKeyCount: 2);
        using var anon = _factory.CreateClient();
        var response = await anon.PostAsJsonAsync(
            "/v1/auth/device-link",
            new RedeemDeviceLinkRequest("not-a-real-token", deviceReq.Device));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}
