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

    private static string DeviceGroup(Guid deviceId) => $"device:{deviceId}";
}
