using GdotChat.Application.Interfaces;
using GdotChat.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace GdotChat.Tests.Integration;

[Collection("Integration")]
public sealed class EnvelopePurgeTests
{
    private readonly GdotChatWebApplicationFactory _factory;

    public EnvelopePurgeTests(GdotChatWebApplicationFactory factory) => _factory = factory;

    [Fact]
    public async Task PurgeExpiredAsync_RemovesExpiredEnvelopes()
    {
        var sender = await _factory.CreateClient().RegisterAsync();
        var recipient = await _factory.CreateClient().RegisterAsync();

        Guid envelopeId;
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<DbContext>();
            envelopeId = Guid.NewGuid();
            db.Set<MessageEnvelope>().Add(new MessageEnvelope
            {
                Id = envelopeId,
                SenderDeviceId = sender.DeviceId,
                RecipientDeviceId = recipient.DeviceId,
                MessageType = 3,
                Ciphertext = [1, 2, 3],
                CreatedAt = DateTimeOffset.UtcNow.AddDays(-8),
                ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(-1),
            });
            await db.SaveChangesAsync();
        }

        await using var purgeScope = _factory.Services.CreateAsyncScope();
        var relay = purgeScope.ServiceProvider.GetRequiredService<IMessageRelayService>();
        var removed = await relay.PurgeExpiredAsync();

        Assert.True(removed >= 1);

        await using var verifyScope = _factory.Services.CreateAsyncScope();
        var verifyDb = verifyScope.ServiceProvider.GetRequiredService<DbContext>();
        Assert.False(await verifyDb.Set<MessageEnvelope>().AnyAsync(e => e.Id == envelopeId));
    }
}
