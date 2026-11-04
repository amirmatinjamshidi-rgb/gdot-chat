namespace GdotChat.Application.Interfaces;

public readonly record struct EnvelopeNotifyItem(Guid RecipientDeviceId, Guid EnvelopeId);

/// <summary>
/// Bounded queue for post-commit SignalR envelope wake-ups.
/// HTTP handlers enqueue and return; a background worker drains in batches.
/// If the queue is full, TryEnqueue* returns false — devices still receive via poll/sync.
/// </summary>
public interface IEnvelopeNotifyQueue
{
    bool TryEnqueue(EnvelopeNotifyItem item);

    /// <summary>
    /// Enqueues all items atomically when capacity allows; otherwise enqueues none and returns false.
    /// </summary>
    bool TryEnqueueMany(IReadOnlyList<EnvelopeNotifyItem> items);

    int QueuedCount { get; }

    int Capacity { get; }
}
