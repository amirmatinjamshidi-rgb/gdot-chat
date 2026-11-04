using GdotChat.Application.DTOs;
using GdotChat.Application.Interfaces;
using GdotChat.Infrastructure.Hubs;
using Microsoft.AspNetCore.SignalR;

namespace GdotChat.Infrastructure.Notifications;

public class SignalRMessageNotifier : IMessageNotifier
{
    private readonly IHubContext<MessageRelayHub> _hubContext;

    public SignalRMessageNotifier(IHubContext<MessageRelayHub> hubContext) =>
        _hubContext = hubContext;

    public Task NotifyEnvelopeAvailableAsync(
        Guid recipientDeviceId,
        Guid envelopeId,
        CancellationToken ct = default) =>
        _hubContext.Clients
            .Group(DeviceGroup(recipientDeviceId))
            .SendAsync("EnvelopeAvailable", new EnvelopeAvailablePayload(envelopeId), ct);

    public Task NotifyEnvelopeAvailableManyAsync(
        IReadOnlyList<Guid> recipientDeviceIds,
        Guid envelopeIdForPayload,
        CancellationToken ct = default)
    {
        if (recipientDeviceIds.Count == 0)
            return Task.CompletedTask;

        var groups = new string[recipientDeviceIds.Count];
        for (var i = 0; i < recipientDeviceIds.Count; i++)
            groups[i] = DeviceGroup(recipientDeviceIds[i]);

        return _hubContext.Clients
            .Groups(groups)
            .SendAsync("EnvelopeAvailable", new EnvelopeAvailablePayload(envelopeIdForPayload), ct);
    }

    public Task NotifyPreKeysLowAsync(
        Guid deviceId,
        int remainingCount,
        CancellationToken ct = default) =>
        _hubContext.Clients
            .Group(DeviceGroup(deviceId))
            .SendAsync("PreKeysLow", new PreKeysLowPayload(remainingCount), ct);

    public Task NotifySessionResetRequestedAsync(
        Guid targetDeviceId,
        Guid fromDeviceId,
        Guid fromUserId,
        CancellationToken ct = default) =>
        _hubContext.Clients
            .Group(DeviceGroup(targetDeviceId))
            .SendAsync(
                "SessionResetRequested",
                new SessionResetRequestedPayload(fromDeviceId, fromUserId),
                ct);

    public Task NotifyGroupMembershipChangedAsync(
        Guid recipientDeviceId,
        GroupMembershipChangedPayload payload,
        CancellationToken ct = default) =>
        _hubContext.Clients
            .Group(DeviceGroup(recipientDeviceId))
            .SendAsync("GroupMembershipChanged", payload, ct);

    public Task NotifyGroupMembershipChangedManyAsync(
        IReadOnlyList<Guid> recipientDeviceIds,
        GroupMembershipChangedPayload payload,
        CancellationToken ct = default)
    {
        if (recipientDeviceIds.Count == 0)
            return Task.CompletedTask;

        var groups = new string[recipientDeviceIds.Count];
        for (var i = 0; i < recipientDeviceIds.Count; i++)
            groups[i] = DeviceGroup(recipientDeviceIds[i]);

        return _hubContext.Clients
            .Groups(groups)
            .SendAsync("GroupMembershipChanged", payload, ct);
    }

    private static string DeviceGroup(Guid deviceId) => $"device:{deviceId}";
}
