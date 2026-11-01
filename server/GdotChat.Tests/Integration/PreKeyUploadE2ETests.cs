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
        var (targetReg, targetKeys) = TestData.CreateRegisterRequestWithKeys(oneTimePreKeyCount: 1);
        var target = await _client.RegisterAsync(targetReg);
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
            targetKeys.CreateSignedPreKey(2),
            new List<OneTimePreKeyDto>
            {
                targetKeys.CreateOneTimePreKey(5001),
                targetKeys.CreateOneTimePreKey(5002),
            });
        var put = await targetClient.PutAsJsonAsync($"/v1/devices/{target.DeviceId}/prekeys", upload);
        Assert.Equal(HttpStatusCode.NoContent, put.StatusCode);

        var again = await callerClient.GetFromJsonAsync<PreKeyBundleDto>(path);
        Assert.NotNull(again?.OneTimePreKey);
        Assert.Equal(5001, again!.OneTimePreKey!.KeyId);
        Assert.Equal(2, again.SignedPreKey.KeyId);
    }
}
