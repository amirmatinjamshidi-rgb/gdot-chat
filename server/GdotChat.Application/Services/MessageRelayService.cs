using GdotChat.Application.DTOs;
using GdotChat.Application.Interfaces;
using GdotChat.Application.Mapping;
using GdotChat.Application.Options;
using GdotChat.Domain.Entities;
using GdotChat.Domain.Exceptions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace GdotChat.Application.Services;

public class MessageRelayService : IMessageRelayService
{
    private readonly DbContext _db;
    private readonly IMessageNotifier _notifier;
    private readonly RelayOptions _relayOptions;
    private readonly ILogger<MessageRelayService> _logger;

    public MessageRelayService(
        DbContext db,
        IMessageNotifier notifier,
        IOptions<RelayOptions> relayOptions,
        ILogger<MessageRelayService> logger)
    {
        _db = db;
        _notifier = notifier;
        _relayOptions = relayOptions.Value;
        _logger = logger;
    }

    public async Task<Guid> EnqueueAsync(
        Guid senderDeviceId,
        SendMessageRequest request,
        CancellationToken ct = default)
    {
        var recipient = await _db.Set<Device>()
            .FirstOrDefaultAsync(
                d => d.Id == request.RecipientDeviceId
                     && d.UserId == request.RecipientUserId
                     && d.IsActive,
                ct)
            ?? throw new DeviceNotFoundException();

        var now = DateTimeOffset.UtcNow;
        var envelope = new MessageEnvelope
        {
            Id = Guid.NewGuid(),
            SenderDeviceId = senderDeviceId,
            RecipientDeviceId = recipient.Id,
            MessageType = request.MessageType,
            Ciphertext = DtoMapper.FromBase64(request.CiphertextBase64),
            CreatedAt = now,
            ExpiresAt = now.AddDays(_relayOptions.EnvelopeTtlDays),
        };

        _db.Set<MessageEnvelope>().Add(envelope);
        await _db.SaveChangesAsync(ct);

        _logger.LogInformation(
            "Enqueued envelope {EnvelopeId} to device {RecipientDeviceId}, ciphertext length {Length}",
            envelope.Id,
            recipient.Id,
            envelope.Ciphertext.Length);

        await _notifier.NotifyEnvelopeAvailableAsync(recipient.Id, envelope.Id, ct);
        return envelope.Id;
    }

    public async Task<IReadOnlyList<MessageEnvelopeDto>> GetPendingForDeviceAsync(
        Guid deviceId,
        int limit,
        CancellationToken ct = default)
    {
        limit = Math.Clamp(limit, 1, 100);
        var now = DateTimeOffset.UtcNow;

        var envelopes = await _db.Set<MessageEnvelope>()
            .Where(e => e.RecipientDeviceId == deviceId && e.ExpiresAt > now)
            .OrderBy(e => e.CreatedAt)
            .Take(limit)
            .ToListAsync(ct);

        return envelopes.Select(DtoMapper.ToDto).ToList();
    }

    public async Task AckAsync(Guid deviceId, Guid envelopeId, CancellationToken ct = default)
    {
        var envelope = await _db.Set<MessageEnvelope>()
            .FirstOrDefaultAsync(e => e.Id == envelopeId, ct)
            ?? throw new EnvelopeNotFoundException();

        if (envelope.RecipientDeviceId != deviceId)
            throw new ForbiddenDeviceException();

        _db.Set<MessageEnvelope>().Remove(envelope);
        await _db.SaveChangesAsync(ct);
    }

    public async Task<int> PurgeExpiredAsync(CancellationToken ct = default)
    {
        var now = DateTimeOffset.UtcNow;
        var expired = await _db.Set<MessageEnvelope>()
            .Where(e => e.ExpiresAt < now)
            .ToListAsync(ct);

        if (expired.Count == 0) return 0;

        _db.Set<MessageEnvelope>().RemoveRange(expired);
        await _db.SaveChangesAsync(ct);

        _logger.LogInformation("Purged {Count} expired envelopes", expired.Count);
        return expired.Count;
    }
}
