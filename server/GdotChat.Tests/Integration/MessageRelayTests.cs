using System.Net.Http.Json;
using System.Text;
using GdotChat.Application.DTOs;
using GdotChat.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace GdotChat.Tests.Integration;

[Collection("Integration")]
public sealed class MessageRelayTests
{
    private readonly GdotChatWebApplicationFactory _factory;
    private readonly HttpClient _client;

    public MessageRelayTests(GdotChatWebApplicationFactory factory)
    {
        _factory = factory;
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task Enqueue_Pending_Ack_DeletesEnvelope_AndCiphertextIsOpaque()
    {
        const string opaquePayload = "opaque-ciphertext-bytes-for-relay";
        var sender = await _client.RegisterAsync();
        var recipient = await _client.RegisterAsync();

        using var senderClient = _factory.CreateClient();
        senderClient.SetBearer(sender.AccessToken);

        var ciphertextBase64 = Convert.ToBase64String(Encoding.UTF8.GetBytes(opaquePayload));
        var sendResponse = await senderClient.PostAsJsonAsync(
            "/v1/messages",
            new SendMessageRequest(
                recipient.UserId,
                recipient.DeviceId,
                3,
                ciphertextBase64));

        sendResponse.EnsureSuccessStatusCode();
        var sent = await sendResponse.Content.ReadFromJsonAsync<SendMessageResponse>();
        Assert.NotNull(sent);

        var expectedCiphertext = Convert.FromBase64String(ciphertextBase64);
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<DbContext>();
            var stored = await db.Set<MessageEnvelope>().FirstAsync(e => e.Id == sent.EnvelopeId);
            Assert.Equal(expectedCiphertext, stored.Ciphertext);
            Assert.Equal(3, stored.MessageType);
        }

        using var recipientClient = _factory.CreateClient();
        recipientClient.SetBearer(recipient.AccessToken);

        var pending = await recipientClient.GetFromJsonAsync<MessageEnvelopeDto[]>(
            "/v1/messages/pending?limit=50");

        Assert.NotNull(pending);
        Assert.Single(pending);
        Assert.Equal(sent.EnvelopeId, pending[0].Id);
        Assert.Equal(ciphertextBase64, pending[0].CiphertextBase64);

        var ackResponse = await recipientClient.PostAsync(
            $"/v1/messages/{sent.EnvelopeId}/ack",
            null);
        ackResponse.EnsureSuccessStatusCode();

        var pendingAfter = await recipientClient.GetFromJsonAsync<MessageEnvelopeDto[]>(
            "/v1/messages/pending?limit=50");

        Assert.NotNull(pendingAfter);
        Assert.Empty(pendingAfter);

        await using var verifyScope = _factory.Services.CreateAsyncScope();
        var verifyDb = verifyScope.ServiceProvider.GetRequiredService<DbContext>();
        Assert.False(await verifyDb.Set<MessageEnvelope>().AnyAsync(e => e.Id == sent.EnvelopeId));
    }
}
