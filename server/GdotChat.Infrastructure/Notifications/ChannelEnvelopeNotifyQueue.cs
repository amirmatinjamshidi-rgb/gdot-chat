using System.Threading.Channels;
using GdotChat.Application.Interfaces;
using Microsoft.Extensions.Logging;

namespace GdotChat.Infrastructure.Notifications;

public sealed class ChannelEnvelopeNotifyQueue : IEnvelopeNotifyQueue
{
    public const int DefaultCapacity = 10_000;

    private readonly Channel<EnvelopeNotifyItem> _channel;
    private readonly ILogger<ChannelEnvelopeNotifyQueue> _logger;
    private int _count;

    public ChannelEnvelopeNotifyQueue(
        ILogger<ChannelEnvelopeNotifyQueue> logger,
        int capacity = DefaultCapacity)
    {
        if (capacity < 1)
            throw new ArgumentOutOfRangeException(nameof(capacity));
        Capacity = capacity;
        _logger = logger;
        _channel = Channel.CreateBounded<EnvelopeNotifyItem>(new BoundedChannelOptions(capacity)
        {
            FullMode = BoundedChannelFullMode.Wait,
            SingleReader = true,
            SingleWriter = false,
        });
    }

    public int Capacity { get; }

    public int QueuedCount => Volatile.Read(ref _count);

    public ChannelReader<EnvelopeNotifyItem> Reader => _channel.Reader;

    public bool TryEnqueue(EnvelopeNotifyItem item)
    {
        if (_channel.Writer.TryWrite(item))
        {
            Interlocked.Increment(ref _count);
            return true;
        }

        _logger.LogWarning(
            "Envelope notify queue full (capacity {Capacity}); dropping wake-up for device {DeviceId}. Devices still poll/sync.",
            Capacity,
            item.RecipientDeviceId);
        return false;
    }

    public bool TryEnqueueMany(IReadOnlyList<EnvelopeNotifyItem> items)
    {
        if (items.Count == 0)
            return true;

        // Best-effort: enqueue what fits; report false if any dropped.
        var allOk = true;
        foreach (var item in items)
        {
            if (!TryEnqueue(item))
                allOk = false;
        }
        return allOk;
    }

    internal void MarkConsumed(int n)
    {
        if (n <= 0) return;
        Interlocked.Add(ref _count, -n);
    }
}
