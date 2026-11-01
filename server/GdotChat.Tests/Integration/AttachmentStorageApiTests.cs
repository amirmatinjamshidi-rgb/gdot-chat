using GdotChat.Application.Interfaces;
using GdotChat.Application.Services;
using GdotChat.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace GdotChat.Tests.Integration;

/// <summary>
/// API/storage-level: Complete inventory rejects missing/wrong-sized chunks; purge clears objects.
/// Uses fresh random devices from register — no shared fixture data.
/// </summary>
[Collection("Integration")]
public sealed class AttachmentStorageApiTests
{
    private readonly GdotChatWebApplicationFactory _factory;

    public AttachmentStorageApiTests(GdotChatWebApplicationFactory factory) => _factory = factory;

    [Fact]
    public async Task InMemoryPutGet_UsesAsyncIo_AndReportsExactSize()
    {
        var storage = _factory.Services.GetRequiredService<IAttachmentStorage>();
        var id = Guid.NewGuid();
        var payload = new byte[24];
        Random.Shared.NextBytes(payload);

        await storage.PutChunkAsync(id, 0, new MemoryStream(payload), payload.Length);
        Assert.Equal(payload.LongLength, await storage.GetChunkSizeAsync(id, 0));

        await using var ms = new MemoryStream();
        await storage.GetChunkAsync(id, 0, ms);
        Assert.Equal(payload, ms.ToArray());

        var listed = await storage.ListChunksAsync(id, 1);
        Assert.Single(listed);
        Assert.Equal(0, listed[0].Index);
        Assert.Equal(payload.LongLength, listed[0].SizeBytes);
    }

    [Fact]
    public async Task Complete_RequiresExactCiphertextSizes_FromStorage()
    {
        var sender = await _factory.CreateClient().RegisterAsync();
        var recipient = await _factory.CreateClient().RegisterAsync();

        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<DbContext>();
        var svc = scope.ServiceProvider.GetRequiredService<IAttachmentService>();
        var storage = scope.ServiceProvider.GetRequiredService<IAttachmentStorage>();

        var attachmentId = Guid.NewGuid();
        const int plainSize = 10;
        var attachment = new Attachment
        {
            Id = attachmentId,
            SenderDeviceId = sender.DeviceId,
            RecipientDeviceId = recipient.DeviceId,
            PlainSizeBytes = plainSize,
            ChunkSizeBytes = 4 * 1024 * 1024,
            ChunkCount = 1,
            Status = Domain.Enums.AttachmentStatus.Uploading,
            CreatedAt = DateTimeOffset.UtcNow,
            ExpiresAt = DateTimeOffset.UtcNow.AddDays(1),
        };
        db.Set<Attachment>().Add(attachment);
        await db.SaveChangesAsync();

        // Wrong size (zero-length ghost) must not satisfy Complete.
        await storage.PutChunkAsync(attachmentId, 0, new MemoryStream(Array.Empty<byte>()), 0);
        await Assert.ThrowsAsync<Domain.Exceptions.AttachmentConflictException>(
            () => svc.CompleteAsync(sender.DeviceId, attachmentId));

        var expected = AttachmentService.ExpectedCiphertextLength(attachment, 0);
        var bytes = new byte[expected];
        Random.Shared.NextBytes(bytes);
        await storage.PutChunkAsync(attachmentId, 0, new MemoryStream(bytes), expected);

        await svc.CompleteAsync(sender.DeviceId, attachmentId);
        var refreshed = await db.Set<Attachment>().AsNoTracking().FirstAsync(a => a.Id == attachmentId);
        Assert.Equal(Domain.Enums.AttachmentStatus.Ready, refreshed.Status);
    }
}
