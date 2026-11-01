using System.Net;
using System.Net.Http.Json;
using GdotChat.Application.DTOs;

namespace GdotChat.Tests.Integration;

/// <summary>
/// E2E: exhaust OTKs → upload replenishment with new SPK keyId → bundle fetch works again.
/// </summary>
[Collection("Integration")]
public sealed class PreKeyUploadE2ETests
{
    private readonly GdotChatWebApplicationFactory _factory;
    private readonly HttpClient _client;

    public PreKeyUploadE2ETests(GdotChatWebApplicationFactory factory)
    {
        _factory = factory;
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task Exhaust_ReplenishWithNewSpk_FetchSucceeds()
    {
        var target = await _client.RegisterAsync(TestData.CreateRegisterRequest(oneTimePreKeyCount: 1));
        var caller = await _client.RegisterAsync();
        using var callerClient = _factory.CreateClient();
        callerClient.SetBearer(caller.AccessToken);

        var path = $"/v1/users/{target.UserId}/devices/{target.DeviceId}/prekey-bundle";
        var first = await callerClient.GetAsync(path);
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);

        var exhausted = await callerClient.GetAsync(path);
        Assert.Equal((HttpStatusCode)428, exhausted.StatusCode);

        using var targetClient = _factory.CreateClient();
        targetClient.SetBearer(target.AccessToken);
        var upload = new UploadPreKeysRequest(
            new SignedPreKeyDto(2, TestData.B64(32), TestData.B64(64)),
            new List<OneTimePreKeyDto>
            {
                new(5001, TestData.B64(32)),
                new(5002, TestData.B64(32)),
            });
        var put = await targetClient.PutAsJsonAsync($"/v1/devices/{target.DeviceId}/prekeys", upload);
        Assert.Equal(HttpStatusCode.NoContent, put.StatusCode);

        var again = await callerClient.GetFromJsonAsync<PreKeyBundleDto>(path);
        Assert.NotNull(again?.OneTimePreKey);
        Assert.Equal(5001, again!.OneTimePreKey!.KeyId);
        Assert.Equal(2, again.SignedPreKey.KeyId);
    }
}
