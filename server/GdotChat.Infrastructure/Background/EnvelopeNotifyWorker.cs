using System.Diagnostics;
using GdotChat.Application.Interfaces;
using GdotChat.Infrastructure.Notifications;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace GdotChat.Infrastructure.Background;

/// <summary>
/// Drains the envelope notify channel in batches and wakes devices via one SignalR Groups call per batch.
/// </summary>
public sealed class EnvelopeNotifyWorker : BackgroundService
{
    public const int DefaultBatchSize = 100;

    private readonly ChannelEnvelopeNotifyQueue _queue;
    private readonly IMessageNotifier _notifier;
    private readonly EnvelopeNotifyMetrics _metrics;
    private readonly ILogger<EnvelopeNotifyWorker> _logger;
    private readonly int _batchSize;

    public EnvelopeNotifyWorker(
        ChannelEnvelopeNotifyQueue queue,
        IMessageNotifier notifier,
        EnvelopeNotifyMetrics metrics,
        ILogger<EnvelopeNotifyWorker> logger,
        int batchSize = DefaultBatchSize)
    {
        _queue = queue;
        _notifier = notifier;
        _metrics = metrics;
        _logger = logger;
        _batchSize = Math.Max(1, batchSize);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var reader = _queue.Reader;
        var buffer = new List<EnvelopeNotifyItem>(_batchSize);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                if (!await reader.WaitToReadAsync(stoppingToken))
                    break;

                buffer.Clear();
                while (buffer.Count < _batchSize && reader.TryRead(out var item))
                    buffer.Add(item);

                if (buffer.Count == 0)
                    continue;

                _queue.MarkConsumed(buffer.Count);

                var sw = Stopwatch.StartNew();
                // One wake-up for the whole batch; client ignores the specific envelope id.
                var deviceIds = new List<Guid>(buffer.Count);
                var seen = new HashSet<Guid>();
                foreach (var item in buffer)
                {
                    if (seen.Add(item.RecipientDeviceId))
                        deviceIds.Add(item.RecipientDeviceId);
                }

                await _notifier.NotifyEnvelopeAvailableManyAsync(
                    deviceIds,
                    buffer[0].EnvelopeId,
                    stoppingToken);

                sw.Stop();
                _metrics.RecordBatch(buffer.Count, sw.ElapsedMilliseconds);

                var snap = _metrics.Snapshot();
                _logger.LogDebug(
                    "Envelope notify batch size={Size} uniqueDevices={Devices} took={Ms}ms queueDepth={Depth} p95Ms={P95} totalBatches={Batches}",
                    buffer.Count,
                    deviceIds.Count,
                    sw.ElapsedMilliseconds,
                    _queue.QueuedCount,
                    snap.P95Ms,
                    snap.Batches);

                if (snap.Batches % 50 == 0)
                {
                    _logger.LogInformation(
                        "Envelope notify stats: batches={Batches} items={Items} p95Ms={P95} queueDepth={Depth}/{Capacity}",
                        snap.Batches,
                        snap.Items,
                        snap.P95Ms,
                        _queue.QueuedCount,
                        _queue.Capacity);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Envelope notify worker failed a batch");
                try { await Task.Delay(TimeSpan.FromMilliseconds(200), stoppingToken); }
                catch (OperationCanceledException) { break; }
            }
        }
    }
}
