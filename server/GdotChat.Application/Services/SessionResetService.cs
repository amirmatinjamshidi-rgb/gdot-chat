using GdotChat.Application.Interfaces;
using GdotChat.Application.Security;
using GdotChat.Domain.Entities;
using GdotChat.Domain.Exceptions;
using Microsoft.EntityFrameworkCore;

namespace GdotChat.Application.Services;

public class SessionResetService : ISessionResetService
{
    private readonly DbContext _db;
    private readonly IMessageNotifier _notifier;
    private readonly ISessionResetRateLimiter _rateLimiter;

    public SessionResetService(
        DbContext db,
        IMessageNotifier notifier,
        ISessionResetRateLimiter rateLimiter)
    {
        _db = db;
        _notifier = notifier;
        _rateLimiter = rateLimiter;
    }

    public async Task RequestAsync(
        Guid callerDeviceId,
        Guid callerUserId,
        Guid targetDeviceId,
        CancellationToken ct = default)
    {
        if (targetDeviceId == callerDeviceId)
            throw new InvalidMessageRequestException("Cannot request session reset to self");

        if (!_rateLimiter.TryAcquire(callerDeviceId, targetDeviceId))
            throw new SessionResetRateLimitedException();

        var target = await _db.Set<Device>()
            .FirstOrDefaultAsync(d => d.Id == targetDeviceId && d.IsActive, ct)
            ?? throw new DeviceNotFoundException();

        await _notifier.NotifySessionResetRequestedAsync(
            target.Id,
            callerDeviceId,
            callerUserId,
            ct);
    }
}
