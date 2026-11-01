using GdotChat.Application.DTOs;
using GdotChat.Application.Interfaces;
using GdotChat.Application.Options;
using GdotChat.Domain.Entities;
using GdotChat.Domain.Enums;
using GdotChat.Domain.Exceptions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace GdotChat.Application.Services;

public class AttachmentService : IAttachmentService
{
    private readonly DbContext _db;
    private readonly IAttachmentStorage _storage;
    private readonly AttachmentOptions _options;
    private readonly ILogger<AttachmentService> _logger;

    public AttachmentService(
        DbContext db,
        IAttachmentStorage storage,
        IOptions<AttachmentOptions> options,
        ILogger<AttachmentService> logger)
    {
        _db = db;
        _storage = storage;
        _options = options.Value;
        _logger = logger;
    }

    public async Task<CreateAttachmentResponse> CreateAsync(
        Guid senderDeviceId,
        CreateAttachmentRequest request,
        CancellationToken ct = default)
    {
        if (request.SizeBytes <= 0)
            throw new InvalidAttachmentRequestException("sizeBytes must be positive");
        if (request.SizeBytes > _options.MaxSizeBytes)
            throw new AttachmentTooLargeException();

        var recipient = await _db.Set<Device>()
            .FirstOrDefaultAsync(
                d => d.Id == request.RecipientDeviceId
                     && d.UserId == request.RecipientUserId
                     && d.IsActive,
                ct)
            ?? throw new DeviceNotFoundException();

        var activeCount = await _db.Set<Attachment>().CountAsync(
            a => a.SenderDeviceId == senderDeviceId
                 && (a.Status == AttachmentStatus.Uploading || a.Status == AttachmentStatus.Ready)
                 && a.ExpiresAt > DateTimeOffset.UtcNow,
            ct);
        if (activeCount >= _options.MaxActivePerDevice)
            throw new AttachmentConflictException("Too many active attachments for this device");

        var now = DateTimeOffset.UtcNow;
        var chunkSize = _options.ChunkSizeBytes;
        var chunkCount = (int)((request.SizeBytes + chunkSize - 1) / chunkSize);
        var attachment = new Attachment
        {
            Id = Guid.NewGuid(),
            SenderDeviceId = senderDeviceId,
            RecipientDeviceId = recipient.Id,
            PlainSizeBytes = request.SizeBytes,
            ChunkSizeBytes = chunkSize,
            ChunkCount = chunkCount,
            Status = AttachmentStatus.Uploading,
            CreatedAt = now,
            ExpiresAt = now.AddDays(_options.TtlDays),
        };
        _db.Set<Attachment>().Add(attachment);
        await _db.SaveChangesAsync(ct);

        return new CreateAttachmentResponse(
            attachment.Id,
            attachment.ChunkSizeBytes,
            attachment.ChunkCount,
            attachment.ExpiresAt);
    }

    public async Task PutChunkAsync(
        Guid senderDeviceId,
        Guid attachmentId,
        int chunkIndex,
        Stream body,
        long? contentLength,
        CancellationToken ct = default)
    {
        var attachment = await LoadFreshAsync(attachmentId, ct);
        AssertSender(attachment, senderDeviceId);
        if (attachment.Status != AttachmentStatus.Uploading)
            throw new AttachmentConflictException("Attachment is not accepting uploads");
        if (chunkIndex < 0 || chunkIndex >= attachment.ChunkCount)
            throw new InvalidAttachmentRequestException("chunk index out of range");

        var expected = ExpectedCiphertextLength(attachment, chunkIndex);
        if (contentLength is null)
            throw new InvalidAttachmentRequestException("Content-Length is required");
        if (contentLength.Value != expected)
            throw new InvalidAttachmentRequestException("chunk size is invalid");

        var existingSize = await _storage.GetChunkSizeAsync(attachmentId, chunkIndex, ct);
        if (existingSize == expected)
        {
            await DrainAsync(body, ct);
            return;
        }

        await _storage.PutChunkAsync(attachmentId, chunkIndex, body, expected, ct);
    }

    public async Task<AttachmentStatusDto> GetStatusAsync(
        Guid callerDeviceId,
        Guid attachmentId,
        CancellationToken ct = default)
    {
        var attachment = await LoadFreshAsync(attachmentId, ct);
        AssertParty(attachment, callerDeviceId);
        var chunks = await _storage.ListChunksAsync(attachmentId, attachment.ChunkCount, ct);
        return new AttachmentStatusDto(
            attachment.Id,
            attachment.PlainSizeBytes,
            attachment.ChunkSizeBytes,
            attachment.ChunkCount,
            chunks.Select(c => c.Index).OrderBy(i => i).ToList(),
            attachment.Status.ToString().ToLowerInvariant(),
            attachment.ExpiresAt);
    }

    public async Task CompleteAsync(Guid senderDeviceId, Guid attachmentId, CancellationToken ct = default)
    {
        var attachment = await LoadFreshAsync(attachmentId, ct);
        AssertSender(attachment, senderDeviceId);
        if (attachment.Status == AttachmentStatus.Ready)
            return;
        if (attachment.Status != AttachmentStatus.Uploading)
            throw new AttachmentConflictException("Attachment cannot be completed");

        var chunks = await _storage.ListChunksAsync(attachmentId, attachment.ChunkCount, ct);
        if (chunks.Count != attachment.ChunkCount)
            throw new AttachmentConflictException("Not all chunks have been uploaded");

        var byIndex = chunks.ToDictionary(c => c.Index, c => c.SizeBytes);
        for (var i = 0; i < attachment.ChunkCount; i++)
        {
            if (!byIndex.TryGetValue(i, out var size) || size != ExpectedCiphertextLength(attachment, i))
                throw new AttachmentConflictException("Not all chunks have been uploaded");
        }

        attachment.Status = AttachmentStatus.Ready;
        attachment.CompletedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync(ct);
    }

    public async Task GetChunkAsync(
        Guid recipientDeviceId,
        Guid attachmentId,
        int chunkIndex,
        Stream destination,
        CancellationToken ct = default)
    {
        var attachment = await LoadFreshAsync(attachmentId, ct);
        if (attachment.RecipientDeviceId != recipientDeviceId)
            throw new ForbiddenDeviceException();
        if (attachment.Status != AttachmentStatus.Ready)
            throw new AttachmentConflictException("Attachment is not ready");
        if (chunkIndex < 0 || chunkIndex >= attachment.ChunkCount)
            throw new InvalidAttachmentRequestException("chunk index out of range");

        try
        {
            await _storage.GetChunkAsync(attachmentId, chunkIndex, destination, ct);
        }
        catch (FileNotFoundException)
        {
            throw new AttachmentNotFoundException();
        }
    }

    public async Task DownloadCompleteAsync(
        Guid recipientDeviceId,
        Guid attachmentId,
        CancellationToken ct = default)
    {
        var attachment = await _db.Set<Attachment>()
            .FirstOrDefaultAsync(a => a.Id == attachmentId, ct);
        if (attachment is null)
            return;
        if (attachment.RecipientDeviceId != recipientDeviceId)
            throw new ForbiddenDeviceException();

        await DeleteStorageAndRowAsync(attachment, ct);
    }

    public async Task DeleteAsync(Guid senderDeviceId, Guid attachmentId, CancellationToken ct = default)
    {
        var attachment = await _db.Set<Attachment>()
            .FirstOrDefaultAsync(a => a.Id == attachmentId, ct);
        if (attachment is null)
            return;
        AssertSender(attachment, senderDeviceId);
        await DeleteStorageAndRowAsync(attachment, ct);
    }

    public async Task<int> PurgeExpiredAsync(CancellationToken ct = default)
    {
        var now = DateTimeOffset.UtcNow;
        var expired = await _db.Set<Attachment>()
            .Where(a => a.ExpiresAt < now)
            .ToListAsync(ct);
        foreach (var attachment in expired)
        {
            try
            {
                await _storage.DeleteAttachmentAsync(attachment.Id, attachment.ChunkCount, ct);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to delete expired attachment objects {AttachmentId}", attachment.Id);
            }

            _db.Set<Attachment>().Remove(attachment);
        }

        if (expired.Count > 0)
            await _db.SaveChangesAsync(ct);
        return expired.Count;
    }

    private async Task DeleteStorageAndRowAsync(Attachment attachment, CancellationToken ct)
    {
        try
        {
            await _storage.DeleteAttachmentAsync(attachment.Id, attachment.ChunkCount, ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Partial attachment object delete for {AttachmentId}", attachment.Id);
        }

        var tracked = await _db.Set<Attachment>().FirstOrDefaultAsync(a => a.Id == attachment.Id, ct);
        if (tracked is not null)
        {
            _db.Set<Attachment>().Remove(tracked);
            await _db.SaveChangesAsync(ct);
        }
    }

    private async Task<Attachment> LoadFreshAsync(Guid attachmentId, CancellationToken ct)
    {
        var attachment = await _db.Set<Attachment>()
            .FirstOrDefaultAsync(a => a.Id == attachmentId, ct)
            ?? throw new AttachmentNotFoundException();
        if (attachment.ExpiresAt <= DateTimeOffset.UtcNow)
            throw new AttachmentNotFoundException();
        return attachment;
    }

    private static void AssertSender(Attachment attachment, Guid deviceId)
    {
        if (attachment.SenderDeviceId != deviceId)
            throw new ForbiddenDeviceException();
    }

    private static void AssertParty(Attachment attachment, Guid deviceId)
    {
        if (attachment.SenderDeviceId != deviceId && attachment.RecipientDeviceId != deviceId)
            throw new ForbiddenDeviceException();
    }

    public static long ExpectedCiphertextLength(Attachment attachment, int chunkIndex)
    {
        var plain = PlainChunkLength(attachment.PlainSizeBytes, attachment.ChunkSizeBytes, chunkIndex, attachment.ChunkCount);
        return plain + AttachmentOptions.GcmTagBytes;
    }

    public static int PlainChunkLength(long plainSize, int chunkSize, int chunkIndex, int chunkCount)
    {
        if (chunkIndex < chunkCount - 1)
            return chunkSize;
        return (int)(plainSize - (long)chunkSize * (chunkCount - 1));
    }

    private static async Task DrainAsync(Stream body, CancellationToken ct)
    {
        var buffer = new byte[8192];
        while (await body.ReadAsync(buffer, ct) > 0)
        {
        }
    }
}