using System.Net;
using System.Net.Http.Json;
using System.Text;
using GdotChat.Application.DTOs;

namespace GdotChat.Tests.Integration;

/// <summary>
/// E2E: fresh random users exercise MessageType + ciphertext bound end-to-end
/// (register → send → pending), without hardcoded ids.
/// </summary>
[Collection("Integration")]
public sealed class MessageLimitE2ETests
{
    private readonly GdotChatWebApplicationFactory _factory;
    private readonly HttpClient _client;

    public MessageLimitE2ETests(GdotChatWebApplicationFactory factory)
    {
        _factory = factory;
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task Send_RejectsInvalidTypeAndOversized_ThenAcceptsValidEnvelope()
    {
        var sender = await _client.RegisterAsync(TestData.CreateRegisterRequest());
        var recipient = await _client.RegisterAsync(TestData.CreateRegisterRequest());

        using var senderClient = _factory.CreateClient();
        senderClient.SetBearer(sender.AccessToken);

        var okCipher = Convert.ToBase64String(
            Encoding.UTF8.GetBytes($"opaque-{Guid.NewGuid():N}"));

        var badType = await senderClient.PostAsJsonAsync(
            "/v1/messages",
            new SendMessageRequest(recipient.UserId, recipient.DeviceId, 99, okCipher));
        Assert.Equal(HttpStatusCode.BadRequest, badType.StatusCode);

        var oversizedBytes = new byte[65_537];
        Random.Shared.NextBytes(oversizedBytes);
        var badSize = await senderClient.PostAsJsonAsync(
            "/v1/messages",
            new SendMessageRequest(
                recipient.UserId,
                recipient.DeviceId,
                3,
                Convert.ToBase64String(oversizedBytes)));
        Assert.Equal(HttpStatusCode.BadRequest, badSize.StatusCode);

        var ok = await senderClient.PostAsJsonAsync(
            "/v1/messages",
            new SendMessageRequest(recipient.UserId, recipient.DeviceId, 3, okCipher));
        Assert.Equal(HttpStatusCode.Created, ok.StatusCode);
        var sent = (await ok.Content.ReadFromJsonAsync<SendMessageResponse>())!;

        using var recipientClient = _factory.CreateClient();
        recipientClient.SetBearer(recipient.AccessToken);
        var pending = await recipientClient.GetFromJsonAsync<MessageEnvelopeDto[]>(
            "/v1/messages/pending?limit=50");
        Assert.NotNull(pending);
        Assert.Contains(pending, e => e.Id == sent.EnvelopeId && e.MessageType == 3);
    }
}
