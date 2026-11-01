using System.Net;
using System.Net.Http.Json;
using GdotChat.Application.DTOs;

namespace GdotChat.Tests.Integration;

[Collection("Integration")]
public sealed class SessionResetTests
{
    private readonly GdotChatWebApplicationFactory _factory;
    private readonly HttpClient _client;

    public SessionResetTests(GdotChatWebApplicationFactory factory)
    {
        _factory = factory;
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task RequestSessionReset_Returns204_ForActivePeerDevice()
    {
        var caller = await _client.RegisterAsync();
        var peer = await _client.RegisterAsync();

        using var callerClient = _factory.CreateClient();
        callerClient.SetBearer(caller.AccessToken);

        var response = await callerClient.PostAsJsonAsync(
            "/v1/session-resets",
            new SessionResetRequest(peer.DeviceId));

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
    }

    [Fact]
    public async Task RequestSessionReset_UnknownDevice_Returns404()
    {
        var caller = await _client.RegisterAsync();
        using var callerClient = _factory.CreateClient();
        callerClient.SetBearer(caller.AccessToken);

        var response = await callerClient.PostAsJsonAsync(
            "/v1/session-resets",
            new SessionResetRequest(Guid.NewGuid()));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task PendingEnvelope_IncludesSenderUserId()
    {
        var sender = await _client.RegisterAsync();
        var recipient = await _client.RegisterAsync();

        using var senderClient = _factory.CreateClient();
        senderClient.SetBearer(sender.AccessToken);

        var ciphertext = Convert.ToBase64String("opaque-bytes"u8.ToArray());
        var send = await senderClient.PostAsJsonAsync(
            "/v1/messages",
            new SendMessageRequest(recipient.UserId, recipient.DeviceId, 3, ciphertext));
        send.EnsureSuccessStatusCode();

        using var recipientClient = _factory.CreateClient();
        recipientClient.SetBearer(recipient.AccessToken);
        var pending = await recipientClient.GetFromJsonAsync<MessageEnvelopeDto[]>(
            "/v1/messages/pending?limit=10");
        Assert.NotNull(pending);
        Assert.Single(pending);
        Assert.Equal(sender.UserId, pending[0].SenderUserId);
        Assert.Equal(sender.DeviceId, pending[0].SenderDeviceId);
    }
}
