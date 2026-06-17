using GdotChat.Application.DTOs;
using GdotChat.Application.Interfaces;
using GdotChat.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace GdotChat.Application.Services;

public class ReactionService : IReactionService
{
    private readonly DbContext _db;
    private readonly IMessageNotifier _notifier;

    public ReactionService(DbContext db, IMessageNotifier notifier)
    {
        _db = db;
        _notifier = notifier;
    }

    public async Task ToggleAndNotifyAsync(
        Guid senderUserId,
        Guid senderDeviceId,
        ReactionRequest request,
        CancellationToken ct = default)
    {
        if (!Guid.TryParse(request.UserId, out var userId) || userId != senderUserId)
            throw new UnauthorizedAccessException("Reaction userId must match authenticated user.");

        var existing = await _db.Set<MessageReaction>()
            .FirstOrDefaultAsync(
                r => r.MessageClientId == request.MessageId
                     && r.Emoji == request.Emoji
                     && r.UserId == userId,
                ct);

        if (existing is not null)
        {
            _db.Set<MessageReaction>().Remove(existing);
        }
        else
        {
            _db.Set<MessageReaction>().Add(new MessageReaction
            {
                Id = Guid.NewGuid(),
                MessageClientId = request.MessageId,
                ConversationId = request.ConversationId,
                ServerEnvelopeId = request.ServerEnvelopeId,
                UserId = userId,
                RecipientDeviceId = request.RecipientDeviceId,
                Emoji = request.Emoji,
                CreatedAt = DateTimeOffset.UtcNow,
            });
        }

        await _db.SaveChangesAsync(ct);

        var payload = new ReactionPayload(
            request.MessageId,
            request.ConversationId,
            request.Emoji,
            request.UserId,
            request.ServerEnvelopeId);

        await _notifier.NotifyReactionAsync(request.RecipientDeviceId, payload, ct);
    }
}
