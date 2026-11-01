using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using GdotChat.Application.DTOs;
using GdotChat.Application.Security;

namespace GdotChat.Tests.Integration;

[Collection("Integration")]
public sealed class SignedPreKeyVerificationTests
{
    private readonly GdotChatWebApplicationFactory _factory;
    private readonly HttpClient _client;

    public SignedPreKeyVerificationTests(GdotChatWebApplicationFactory factory)
    {
        _factory = factory;
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task Register_RejectsInvalidSignedPreKeySignature()
    {
        var (req, _) = TestData.CreateRegisterRequestWithKeys(oneTimePreKeyCount: 2);
        var badSpk = req.Device.SignedPreKey with
        {
            SignatureBase64 = TestData.B64(64),
        };
        var bad = req with
        {
            Device = req.Device with { SignedPreKey = badSpk },
        };

        var response = await _client.PostAsJsonAsync("/v1/auth/register", bad);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("Signed pre-key signature is invalid", body, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task UploadPreKeys_RejectsInvalidSignedPreKeySignature()
    {
        var (reg, keys) = TestData.CreateRegisterRequestWithKeys(oneTimePreKeyCount: 2);
        var auth = await _client.RegisterAsync(reg);
        using var authed = _factory.CreateClient();
        authed.SetBearer(auth.AccessToken);

        var validSpk = keys.CreateSignedPreKey(9);
        var bad = new UploadPreKeysRequest(
            validSpk with { SignatureBase64 = TestData.B64(64) },
            new List<OneTimePreKeyDto> { keys.CreateOneTimePreKey(9001) });

        var response = await authed.PutAsJsonAsync($"/v1/devices/{auth.DeviceId}/prekeys", bad);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}
