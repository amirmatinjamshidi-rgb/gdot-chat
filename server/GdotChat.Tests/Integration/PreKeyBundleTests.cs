using System.Net;
using System.Net.Http.Json;
using GdotChat.Application.DTOs;

namespace GdotChat.Tests.Integration;

[Collection("Integration")]
public sealed class PreKeyBundleTests
{
    private readonly GdotChatWebApplicationFactory _factory;
    private readonly HttpClient _client;

    public PreKeyBundleTests(GdotChatWebApplicationFactory factory)
    {
        _factory = factory;
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task GetPreKeyBundle_ConsumesOneTimePreKey()
    {
        var target = await _client.RegisterAsync(TestData.CreateRegisterRequest(oneTimePreKeyCount: 5));
        var caller = await _client.RegisterAsync();
        using var callerClient = CreateAuthenticatedClient(caller.AccessToken);

        var first = await callerClient.GetFromJsonAsync<PreKeyBundleDto>(
            $"/v1/users/{target.UserId}/devices/{target.DeviceId}/prekey-bundle");
        var second = await callerClient.GetFromJsonAsync<PreKeyBundleDto>(
            $"/v1/users/{target.UserId}/devices/{target.DeviceId}/prekey-bundle");

        Assert.NotNull(first?.OneTimePreKey);
        Assert.NotNull(second?.OneTimePreKey);
        Assert.NotEqual(first.OneTimePreKey.KeyId, second.OneTimePreKey.KeyId);
    }

    [Fact]
    public async Task GetPreKeyBundle_WhenExhausted_Returns428()
    {
        var target = await _client.RegisterAsync(TestData.CreateRegisterRequest(oneTimePreKeyCount: 1));
        var caller = await _client.RegisterAsync();
        using var callerClient = CreateAuthenticatedClient(caller.AccessToken);

        var first = await callerClient.GetAsync(
            $"/v1/users/{target.UserId}/devices/{target.DeviceId}/prekey-bundle");
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);

        var exhausted = await callerClient.GetAsync(
            $"/v1/users/{target.UserId}/devices/{target.DeviceId}/prekey-bundle");
        Assert.Equal((HttpStatusCode)428, exhausted.StatusCode);
    }

    private HttpClient CreateAuthenticatedClient(string accessToken)
    {
        var client = _factory.CreateClient();
        client.SetBearer(accessToken);
        return client;
    }
}
