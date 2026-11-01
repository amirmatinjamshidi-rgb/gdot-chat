using System.Collections.Concurrent;
using GdotChat.Application.Options;
using Microsoft.Extensions.Options;

namespace GdotChat.Application.Security;

public interface ISessionResetRateLimiter
{
    bool TryAcquire(Guid callerDeviceId, Guid targetDeviceId);
}

/// <summary>
/// Per (callerDevice, targetDevice) fixed-window limiter to prevent session-reset loops/abuse.
/// </summary>
public sealed class SessionResetRateLimiter : ISessionResetRateLimiter
{
    private readonly RateLimitOptions _options;
    private readonly ConcurrentDictionary<string, Window> _windows = new();

    public SessionResetRateLimiter(IOptions<RateLimitOptions> options) =>
        _options = options.Value;

    public bool TryAcquire(Guid callerDeviceId, Guid targetDeviceId)
    {
        var now = DateTimeOffset.UtcNow;
        var key = $"{callerDeviceId:D}->{targetDeviceId:D}";
        var limit = _options.SessionResetPermitLimit;
        var window = TimeSpan.FromSeconds(Math.Max(1, _options.SessionResetWindowSeconds));
        if (limit <= 0) return false;

        while (true)
        {
            var current = _windows.GetOrAdd(key, _ => new Window(now, 0));
            if (now - current.StartedAt >= window)
            {
                var fresh = new Window(now, 1);
                if (_windows.TryUpdate(key, fresh, current))
                    return true;
                continue;
            }

            if (current.Count >= limit)
                return false;

            var next = new Window(current.StartedAt, current.Count + 1);
            if (_windows.TryUpdate(key, next, current))
                return true;
        }
    }

    private sealed record Window(DateTimeOffset StartedAt, int Count);
}
