using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace GdotChat.Infrastructure.Hubs;

[Authorize]
public class MessageRelayHub : Hub
{
    public override async Task OnConnectedAsync()
    {
        var deviceId = Context.User?.FindFirst("device_id")?.Value;
        if (!string.IsNullOrEmpty(deviceId))
            await Groups.AddToGroupAsync(Context.ConnectionId, $"device:{deviceId}");

        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var deviceId = Context.User?.FindFirst("device_id")?.Value;
        if (!string.IsNullOrEmpty(deviceId))
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"device:{deviceId}");

        await base.OnDisconnectedAsync(exception);
    }
}
