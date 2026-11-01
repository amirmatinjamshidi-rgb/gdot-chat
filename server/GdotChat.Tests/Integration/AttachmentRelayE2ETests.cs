using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using GdotChat.Application.DTOs;
using GdotChat.Application.Interfaces;
using GdotChat.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace GdotChat.Tests.Integration;

/// <summary>
/// E2E: two fresh users upload encrypted media, complete, download, download-complete; purge clears storage.
/// </summary>
[Collection("Integration")]
public sealed class AttachmentRelayE2ETests
{
    private readonly GdotChatWebApplicationFactory _factory;

    public AttachmentRelayE2ETests(GdotChatWebApplicationFactory factory) => _factory = factory;

    [Fact]
    public async Task FullUploadDownloadPurge_Flow_WithFreshUsers()
    {
        var sender = await _factory.CreateClient().RegisterAsync();
        var recipient = await _factory.CreateClient().RegisterAsync();
        using var senderClient = _factory.CreateClient();
        senderClient.SetBearer(sender.AccessToken);
        using var recipientClient = _factory.CreateClient();
        recipientClient.SetBearer(recipient.AccessToken);

        var plaintext = RandomNumberGenerator.GetBytes(48);
        var key = RandomNumberGenerator.GetBytes(32);
        var noncePrefix = RandomNumberGenerator.GetBytes(8);
        var ciphertext = EncryptChunk(plaintext, key, noncePrefix);

        var create = await senderClient.PostAsJsonAsync(
            "/v1/attachments",
            new CreateAttachmentRequest(recipient.UserId, recipient.DeviceId, plaintext.Length));
        create.EnsureSuccessStatusCode();
        var created = (await create.Content.ReadFromJsonAsync<CreateAttachmentResponse>())!;

        var upload = await senderClient.PutAsync(
            $"/v1/attachments/{created.AttachmentId}/chunks/0",
            Bytes(ciphertext));
        Assert.Equal(HttpStatusCode.NoContent, upload.StatusCode);

        var complete = await senderClient.PostAsync(
            $"/v1/attachments/{created.AttachmentId}/complete", null);
        Assert.Equal(HttpStatusCode.NoContent, complete.StatusCode);

        var download = await recipientClient.GetAsync(
            $"/v1/attachments/{created.AttachmentId}/chunks/0");
        download.EnsureSuccessStatusCode();
        Assert.Equal(ciphertext, await download.Content.ReadAsByteArrayAsync());

        var done = await recipientClient.PostAsync(
            $"/v1/attachments/{created.AttachmentId}/download-complete", null);
        Assert.Equal(HttpStatusCode.NoContent, done.StatusCode);

        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<DbContext>();
            Assert.False(await db.Set<Attachment>().AnyAsync(a => a.Id == created.AttachmentId));
        }

        // Purge path: expired row + object, then purge removes both (no zero-size leftover).
        var expiredId = Guid.NewGuid();
        var storage = _factory.Services.GetRequiredService<IAttachmentStorage>();
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<DbContext>();
            db.Set<Attachment>().Add(new Attachment
            {
                Id = expiredId,
                SenderDeviceId = sender.DeviceId,
                RecipientDeviceId = recipient.DeviceId,
                PlainSizeBytes = 8,
                ChunkSizeBytes = 4 * 1024 * 1024,
                ChunkCount = 1,
                Status = Domain.Enums.AttachmentStatus.Ready,
                CreatedAt = DateTimeOffset.UtcNow.AddDays(-9),
                ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(-5),
            });
            await db.SaveChangesAsync();
        }

        await storage.PutChunkAsync(expiredId, 0, new MemoryStream(new byte[24]), 24);
        Assert.NotEmpty(await storage.ListChunksAsync(expiredId, 1));

        await using var purgeScope = _factory.Services.CreateAsyncScope();
        var svc = purgeScope.ServiceProvider.GetRequiredService<IAttachmentService>();
        Assert.True(await svc.PurgeExpiredAsync() >= 1);
        Assert.Empty(await storage.ListChunksAsync(expiredId, 1));
        await using var verify = _factory.Services.CreateAsyncScope();
        Assert.False(await verify.ServiceProvider.GetRequiredService<DbContext>()
            .Set<Attachment>().AnyAsync(a => a.Id == expiredId));
    }

    private static ByteArrayContent Bytes(byte[] data)
    {
        var content = new ByteArrayContent(data);
        content.Headers.ContentType =
            new System.Net.Http.Headers.MediaTypeHeaderValue("application/octet-stream");
        return content;
    }

    private static byte[] EncryptChunk(byte[] plaintext, byte[] key, byte[] noncePrefix)
    {
        var nonce = new byte[12];
        Buffer.BlockCopy(noncePrefix, 0, nonce, 0, 8);
        var ciphertext = new byte[plaintext.Length];
        var tag = new byte[16];
        using var gcm = new AesGcm(key, 16);
        gcm.Encrypt(nonce, plaintext, ciphertext, tag, "aad"u8.ToArray());
        var combined = new byte[ciphertext.Length + tag.Length];
        Buffer.BlockCopy(ciphertext, 0, combined, 0, ciphertext.Length);
        Buffer.BlockCopy(tag, 0, combined, ciphertext.Length, tag.Length);
        return combined;
    }
}
