namespace GdotChat.Infrastructure.Notifications;

/// <summary>Lock-free-ish ring of recent batch durations for a rough p95 log line.</summary>
public sealed class EnvelopeNotifyMetrics
{
    private readonly long[] _durationsMs;
    private int _write;
    private int _filled;
    private long _batches;
    private long _items;
    private long _droppedBatches;

    public EnvelopeNotifyMetrics(int sampleSize = 256)
    {
        _durationsMs = new long[Math.Max(16, sampleSize)];
    }

    public void RecordBatch(int itemCount, long durationMs)
    {
        Interlocked.Increment(ref _batches);
        Interlocked.Add(ref _items, itemCount);
        var i = Interlocked.Increment(ref _write) - 1;
        var idx = i % _durationsMs.Length;
        Volatile.Write(ref _durationsMs[idx], durationMs);
        var filled = Volatile.Read(ref _filled);
        if (filled < _durationsMs.Length)
            Interlocked.CompareExchange(ref _filled, filled + 1, filled);
    }

    public void RecordDrop() => Interlocked.Increment(ref _droppedBatches);

    public (long Batches, long Items, long Dropped, long P95Ms) Snapshot()
    {
        var n = Math.Min(Volatile.Read(ref _filled), _durationsMs.Length);
        long p95 = 0;
        if (n > 0)
        {
            var copy = new long[n];
            for (var i = 0; i < n; i++)
                copy[i] = Volatile.Read(ref _durationsMs[i]);
            Array.Sort(copy);
            p95 = copy[Math.Clamp((int)Math.Ceiling(n * 0.95) - 1, 0, n - 1)];
        }

        return (
            Volatile.Read(ref _batches),
            Volatile.Read(ref _items),
            Volatile.Read(ref _droppedBatches),
            p95);
    }
}
