using System.Collections.Concurrent;
using GdotChat.Application.Options;
using Microsoft.Extensions.Options;

namespace GdotChat.Application.Security;

/// <summary>
/// Fixed-window rate limits for pre-key bundle fetches: per caller and per target device.
/// Limits are configurable via <see cref="RateLimitOptions"/> (tests set low values).
/// </summary>
public interface IPreKeyBundleRateLimiter
{
    bool TryAcquire(string callerUserId, Guid targetUserId, Guid targetDeviceId);
}

public sealed class PreKeyBundleRateLimiter : IPreKeyBundleRateLimiter
{
    private readonly RateLimitOptions _options;
    private readonly ConcurrentDictionary<string, Window> _callerWindows = new();
    private readonly ConcurrentDictionary<string, Window> _targetWindows = new();

    public PreKeyBundleRateLimiter(IOptions<RateLimitOptions> options) =>
        _options = options.Value;

    public bool TryAcquire(string callerUserId, Guid targetUserId, Guid targetDeviceId)
    {
        var now = DateTimeOffset.UtcNow;
        if (!TryHit(_callerWindows, $"c:{callerUserId}", _options.PreKeyFetchCallerPermitLimit,
                TimeSpan.FromSeconds(Math.Max(1, _options.PreKeyFetchCallerWindowSeconds)), now))
            return false;

        if (!TryHit(_targetWindows, $"t:{targetUserId:D}:{targetDeviceId:D}",
                _options.PreKeyFetchTargetPermitLimit,
                TimeSpan.FromSeconds(Math.Max(1, _options.PreKeyFetchTargetWindowSeconds)), now))
            return false;

        return true;
    }

    private static bool TryHit(
        ConcurrentDictionary<string, Window> map,
        string key,
        int permitLimit,
        TimeSpan window,
        DateTimeOffset now)
    {
        if (permitLimit <= 0)
            return false;

        while (true)
        {
            var current = map.GetOrAdd(key, _ => new Window(now, 0));
            if (now - current.StartedAt >= window)
            {
                var fresh = new Window(now, 1);
                if (map.TryUpdate(key, fresh, current))
                    return true;
                continue;
            }

            if (current.Count >= permitLimit)
                return false;

            var next = new Window(current.StartedAt, current.Count + 1);
            if (map.TryUpdate(key, next, current))
                return true;
        }
    }

    private sealed record Window(DateTimeOffset StartedAt, int Count);
}
