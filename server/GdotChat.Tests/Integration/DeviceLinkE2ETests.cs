using System.Net.Http.Json;
using GdotChat.Application.DTOs;

namespace GdotChat.Tests.Integration;

/// <summary>
/// E2E: existing device approves a new device via link token; password fallback;
/// envelopes are addressed per device.
/// </summary>
[Collection("Integration")]
public sealed class DeviceLinkE2ETests
{
    private readonly GdotChatWebApplicationFactory _factory;
    private readonly HttpClient _client;

    public DeviceLinkE2ETests(GdotChatWebApplicationFactory factory)
    {
        _factory = factory;
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task MultiDevice_FanOutAddressing_DeliversPerDeviceEnvelope()
    {
        var bobName = TestData.UniqueUsername();
        var bob1 = await _client.RegisterAsync(TestData.CreateRegisterRequest(bobName, oneTimePreKeyCount: 10));
        var (bob2Req, _) = TestData.CreateRegisterRequestWithKeys(oneTimePreKeyCount: 10);
        using var anon = _factory.CreateClient();
        var bob2Resp = await anon.PostAsJsonAsync(
            "/v1/auth/login-new-device",
            new LoginNewDeviceRequest(bobName, "password-123", bob2Req.Device));
        bob2Resp.EnsureSuccessStatusCode();
        var bob2 = await bob2Resp.Content.ReadFromJsonAsync<AuthResultDto>();
        Assert.NotNull(bob2);

        var alice = await _client.RegisterAsync(TestData.CreateRegisterRequest(oneTimePreKeyCount: 5));
        using var aliceClient = _factory.CreateClient();
        aliceClient.SetBearer(alice.AccessToken);

        foreach (var deviceId in new[] { bob1.DeviceId, bob2.DeviceId })
        {
            var send = await aliceClient.PostAsJsonAsync(
                "/v1/messages",
                new SendMessageRequest(
                    bob1.UserId,
                    deviceId,
                    3,
                    Convert.ToBase64String(System.Security.Cryptography.RandomNumberGenerator.GetBytes(48))));
            send.EnsureSuccessStatusCode();
        }

        using var bob1Client = _factory.CreateClient();
        bob1Client.SetBearer(bob1.AccessToken);
        var pending1 = await bob1Client.GetFromJsonAsync<List<MessageEnvelopeDto>>("/v1/messages/pending?limit=10");
        Assert.NotNull(pending1);
        Assert.Single(pending1);

        using var bob2Client = _factory.CreateClient();
        bob2Client.SetBearer(bob2.AccessToken);
        var pending2 = await bob2Client.GetFromJsonAsync<List<MessageEnvelopeDto>>("/v1/messages/pending?limit=10");
        Assert.NotNull(pending2);
        Assert.Single(pending2);
        Assert.NotEqual(pending1[0].Id, pending2[0].Id);
    }
}
