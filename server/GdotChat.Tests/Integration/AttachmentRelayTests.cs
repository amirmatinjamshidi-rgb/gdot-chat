using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using GdotChat.Application.DTOs;
using GdotChat.Application.Interfaces;
using GdotChat.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace GdotChat.Tests.Integration;

[Collection("Integration")]
public sealed class AttachmentRelayTests
{
    private readonly GdotChatWebApplicationFactory _factory;

    public AttachmentRelayTests(GdotChatWebApplicationFactory factory) => _factory = factory;

    [Fact]
    public async Task UploadDownload_RejectsWrongParty_AndNeverStoresKey()
    {
        var sender = await _factory.CreateClient().RegisterAsync();
        var recipient = await _factory.CreateClient().RegisterAsync();
        var stranger = await _factory.CreateClient().RegisterAsync();

        using var senderClient = _factory.CreateClient();
        senderClient.SetBearer(sender.AccessToken);
        using var recipientClient = _factory.CreateClient();
        recipientClient.SetBearer(recipient.AccessToken);
        using var strangerClient = _factory.CreateClient();
        strangerClient.SetBearer(stranger.AccessToken);

        var plaintext = "media-plain-bytes-for-e2ee"u8.ToArray();
        var key = RandomNumberGenerator.GetBytes(32);
        var noncePrefix = RandomNumberGenerator.GetBytes(8);
        var ciphertext = EncryptChunk(plaintext, key, noncePrefix, "aad-not-on-server");

        var create = await senderClient.PostAsJsonAsync(
            "/v1/attachments",
            new CreateAttachmentRequest(recipient.UserId, recipient.DeviceId, plaintext.Length));
        create.EnsureSuccessStatusCode();
        var created = await create.Content.ReadFromJsonAsync<CreateAttachmentResponse>();
        Assert.NotNull(created);
        Assert.Equal(1, created.ChunkCount);

        var wrongSender = await strangerClient.PutAsync(
            $"/v1/attachments/{created.AttachmentId}/chunks/0",
            Bytes(ciphertext));
        Assert.Equal(HttpStatusCode.Forbidden, wrongSender.StatusCode);

        var upload = await senderClient.PutAsync(
            $"/v1/attachments/{created.AttachmentId}/chunks/0",
            Bytes(ciphertext));
        Assert.Equal(HttpStatusCode.NoContent, upload.StatusCode);

        var dup = await senderClient.PutAsync(
            $"/v1/attachments/{created.AttachmentId}/chunks/0",
            Bytes(ciphertext));
        Assert.Equal(HttpStatusCode.NoContent, dup.StatusCode);

        var tooBig = await senderClient.PutAsync(
            $"/v1/attachments/{created.AttachmentId}/chunks/0",
            Bytes(ciphertext.Concat(new byte[] { 1 }).ToArray()));
        Assert.Equal(HttpStatusCode.BadRequest, tooBig.StatusCode);

        var complete = await senderClient.PostAsync(
            $"/v1/attachments/{created.AttachmentId}/complete", null);
        Assert.Equal(HttpStatusCode.NoContent, complete.StatusCode);

        var strangerDl = await strangerClient.GetAsync(
            $"/v1/attachments/{created.AttachmentId}/chunks/0");
        Assert.Equal(HttpStatusCode.Forbidden, strangerDl.StatusCode);

        var senderCompleteAsRecipient = await senderClient.PostAsync(
            $"/v1/attachments/{created.AttachmentId}/download-complete", null);
        Assert.Equal(HttpStatusCode.Forbidden, senderCompleteAsRecipient.StatusCode);

        var download = await recipientClient.GetAsync(
            $"/v1/attachments/{created.AttachmentId}/chunks/0");
        download.EnsureSuccessStatusCode();
        var downloaded = await download.Content.ReadAsByteArrayAsync();
        Assert.Equal(ciphertext, downloaded);

        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<DbContext>();
            var row = await db.Set<Attachment>().FirstAsync(a => a.Id == created.AttachmentId);
            Assert.Equal(plaintext.Length, row.PlainSizeBytes);
            var json = System.Text.Json.JsonSerializer.Serialize(row);
            Assert.DoesNotContain(Convert.ToBase64String(key), json);
            Assert.DoesNotContain(Convert.ToHexString(key), json, StringComparison.OrdinalIgnoreCase);
        }

        var storage = _factory.Services.GetRequiredService<IAttachmentStorage>();
        await using var inspect = new MemoryStream();
        await storage.GetChunkAsync(created.AttachmentId, 0, inspect);
        var stored = inspect.ToArray();
        Assert.Equal(ciphertext, stored);
        Assert.NotEqual(plaintext, stored);

        var done = await recipientClient.PostAsync(
            $"/v1/attachments/{created.AttachmentId}/download-complete", null);
        Assert.Equal(HttpStatusCode.NoContent, done.StatusCode);

        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<DbContext>();
            Assert.False(await db.Set<Attachment>().AnyAsync(a => a.Id == created.AttachmentId));
        }
    }

    [Fact]
    public async Task Complete_FailsWhenChunkMissing_AndOversizeIsRejected()
    {
        var sender = await _factory.CreateClient().RegisterAsync();
        var recipient = await _factory.CreateClient().RegisterAsync();
        using var senderClient = _factory.CreateClient();
        senderClient.SetBearer(sender.AccessToken);

        var oversize = await senderClient.PostAsJsonAsync(
            "/v1/attachments",
            new CreateAttachmentRequest(recipient.UserId, recipient.DeviceId, 2L * 1024 * 1024 * 1024));
        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, oversize.StatusCode);

        var invalid = await senderClient.PostAsJsonAsync(
            "/v1/attachments",
            new CreateAttachmentRequest(recipient.UserId, recipient.DeviceId, 0));
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);

        var create = await senderClient.PostAsJsonAsync(
            "/v1/attachments",
            new CreateAttachmentRequest(recipient.UserId, recipient.DeviceId, 32));
        create.EnsureSuccessStatusCode();
        var created = await create.Content.ReadFromJsonAsync<CreateAttachmentResponse>();
        Assert.NotNull(created);

        var complete = await senderClient.PostAsync(
            $"/v1/attachments/{created.AttachmentId}/complete", null);
        Assert.Equal(HttpStatusCode.Conflict, complete.StatusCode);
    }

    [Fact]
    public async Task PurgeExpired_RemovesMetadataAndObjects()
    {
        var sender = await _factory.CreateClient().RegisterAsync();
        var recipient = await _factory.CreateClient().RegisterAsync();

        Guid attachmentId;
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<DbContext>();
            attachmentId = Guid.NewGuid();
            db.Set<Attachment>().Add(new Attachment
            {
                Id = attachmentId,
                SenderDeviceId = sender.DeviceId,
                RecipientDeviceId = recipient.DeviceId,
                PlainSizeBytes = 8,
                ChunkSizeBytes = 4 * 1024 * 1024,
                ChunkCount = 1,
                Status = Domain.Enums.AttachmentStatus.Uploading,
                CreatedAt = DateTimeOffset.UtcNow.AddDays(-8),
                ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(-1),
            });
            await db.SaveChangesAsync();
        }

        var storage = _factory.Services.GetRequiredService<IAttachmentStorage>();
        await storage.PutChunkAsync(attachmentId, 0, new MemoryStream(new byte[24]), 24);

        await using var purgeScope = _factory.Services.CreateAsyncScope();
        var svc = purgeScope.ServiceProvider.GetRequiredService<IAttachmentService>();
        var removed = await svc.PurgeExpiredAsync();
        Assert.True(removed >= 1);

        await using var verify = _factory.Services.CreateAsyncScope();
        var verifyDb = verify.ServiceProvider.GetRequiredService<DbContext>();
        Assert.False(await verifyDb.Set<Attachment>().AnyAsync(a => a.Id == attachmentId));
        Assert.Empty(await storage.ListChunksAsync(attachmentId, 1));
    }

    [Fact]
    public async Task StatusAndDownload_EnforcePartyAndExpiry()
    {
        var sender = await _factory.CreateClient().RegisterAsync();
        var recipient = await _factory.CreateClient().RegisterAsync();
        using var senderClient = _factory.CreateClient();
        senderClient.SetBearer(sender.AccessToken);
        using var recipientClient = _factory.CreateClient();
        recipientClient.SetBearer(recipient.AccessToken);

        var create = await senderClient.PostAsJsonAsync(
            "/v1/attachments",
            new CreateAttachmentRequest(recipient.UserId, recipient.DeviceId, 8));
        create.EnsureSuccessStatusCode();
        var created = await create.Content.ReadFromJsonAsync<CreateAttachmentResponse>();
        Assert.NotNull(created);

        var recipientUpload = await recipientClient.PutAsync(
            $"/v1/attachments/{created.AttachmentId}/chunks/0",
            Bytes(new byte[24]));
        Assert.Equal(HttpStatusCode.Forbidden, recipientUpload.StatusCode);

        var badIndex = await senderClient.PutAsync(
            $"/v1/attachments/{created.AttachmentId}/chunks/9",
            Bytes(new byte[24]));
        Assert.Equal(HttpStatusCode.BadRequest, badIndex.StatusCode);

        var earlyDownload = await recipientClient.GetAsync(
            $"/v1/attachments/{created.AttachmentId}/chunks/0");
        Assert.Equal(HttpStatusCode.Conflict, earlyDownload.StatusCode);

        var senderDownload = await senderClient.GetAsync(
            $"/v1/attachments/{created.AttachmentId}/chunks/0");
        Assert.Equal(HttpStatusCode.Forbidden, senderDownload.StatusCode);

        Guid expiredId;
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<DbContext>();
            expiredId = Guid.NewGuid();
            db.Set<Attachment>().Add(new Attachment
            {
                Id = expiredId,
                SenderDeviceId = sender.DeviceId,
                RecipientDeviceId = recipient.DeviceId,
                PlainSizeBytes = 8,
                ChunkSizeBytes = 4 * 1024 * 1024,
                ChunkCount = 1,
                Status = Domain.Enums.AttachmentStatus.Ready,
                CreatedAt = DateTimeOffset.UtcNow.AddDays(-8),
                ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(-1),
            });
            await db.SaveChangesAsync();
        }

        var expired = await recipientClient.GetAsync($"/v1/attachments/{expiredId}");
        Assert.Equal(HttpStatusCode.NotFound, expired.StatusCode);
    }

    [Fact]
    public async Task PurgeExpired_ToleratesMissingObjects()
    {
        var sender = await _factory.CreateClient().RegisterAsync();
        var recipient = await _factory.CreateClient().RegisterAsync();
        Guid attachmentId;
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<DbContext>();
            attachmentId = Guid.NewGuid();
            db.Set<Attachment>().Add(new Attachment
            {
                Id = attachmentId,
                SenderDeviceId = sender.DeviceId,
                RecipientDeviceId = recipient.DeviceId,
                PlainSizeBytes = 8,
                ChunkSizeBytes = 4 * 1024 * 1024,
                ChunkCount = 1,
                Status = Domain.Enums.AttachmentStatus.Uploading,
                CreatedAt = DateTimeOffset.UtcNow.AddDays(-8),
                ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(-1),
            });
            await db.SaveChangesAsync();
        }

        await using var purgeScope = _factory.Services.CreateAsyncScope();
        var svc = purgeScope.ServiceProvider.GetRequiredService<IAttachmentService>();
        var removed = await svc.PurgeExpiredAsync();
        Assert.True(removed >= 1);
    }

    private static ByteArrayContent Bytes(byte[] data)
    {
        var content = new ByteArrayContent(data);
        content.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/octet-stream");
        return content;
    }

    private static byte[] EncryptChunk(byte[] plaintext, byte[] key, byte[] noncePrefix, string aadText)
    {
        var nonce = new byte[12];
        Buffer.BlockCopy(noncePrefix, 0, nonce, 0, 8);
        var ciphertext = new byte[plaintext.Length];
        var tag = new byte[16];
        using var gcm = new AesGcm(key, 16);
        gcm.Encrypt(nonce, plaintext, ciphertext, tag, System.Text.Encoding.UTF8.GetBytes(aadText));
        var combined = new byte[ciphertext.Length + tag.Length];
        Buffer.BlockCopy(ciphertext, 0, combined, 0, ciphertext.Length);
        Buffer.BlockCopy(tag, 0, combined, ciphertext.Length, tag.Length);
        return combined;
    }
}