using System.Collections.Concurrent;

namespace GdotChat.Application.Security;

public interface IDeviceLinkRateLimiter
{
    bool TryAcquireCreate(Guid deviceId);
    bool TryAcquireRedeem(string key);
    bool TryAcquireLoginNewDevice(string username);
}

/// <summary>
/// In-memory limits for link-token create/redeem and password new-device login.
/// </summary>
public sealed class DeviceLinkRateLimiter : IDeviceLinkRateLimiter
{
    private static readonly TimeSpan Window = TimeSpan.FromMinutes(15);
    private const int MaxCreatePerDevice = 10;
    private const int MaxRedeemPerKey = 20;
    private const int MaxLoginNewPerUser = 5;

    private readonly ConcurrentDictionary<string, WindowCounter> _windows = new();

    public bool TryAcquireCreate(Guid deviceId) =>
        TryAcquire($"create:{deviceId:D}", MaxCreatePerDevice);

    public bool TryAcquireRedeem(string key) =>
        TryAcquire($"redeem:{key}", MaxRedeemPerKey);

    public bool TryAcquireLoginNewDevice(string username) =>
        TryAcquire($"login-new:{username.Trim().ToLowerInvariant()}", MaxLoginNewPerUser);

    private bool TryAcquire(string key, int max)
    {
        var now = DateTimeOffset.UtcNow;
        var counter = _windows.AddOrUpdate(
            key,
            _ => new WindowCounter(now, 1),
            (_, existing) =>
            {
                if (now - existing.Started > Window)
                    return new WindowCounter(now, 1);
                return existing with { Count = existing.Count + 1 };
            });
        return counter.Count <= max;
    }

    private sealed record WindowCounter(DateTimeOffset Started, int Count);
}
