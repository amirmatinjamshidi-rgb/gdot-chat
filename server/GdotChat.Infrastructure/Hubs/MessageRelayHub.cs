using System.Security.Claims;
using GdotChat.Application.DTOs;
using GdotChat.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace GdotChat.Infrastructure.Hubs;

[Authorize]
public class MessageRelayHub : Hub
{
    private readonly IReactionService _reactionService;

    public MessageRelayHub(IReactionService reactionService) =>
        _reactionService = reactionService;

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

    public async Task SendReaction(ReactionRequest request)
    {
        if (Context.User is null)
            throw new HubException("Unauthorized");

        var userId = ParseUserId(Context.User);
        var deviceId = ParseDeviceId(Context.User);
        await _reactionService.ToggleAndNotifyAsync(userId, deviceId, request);
    }

    private static Guid ParseUserId(ClaimsPrincipal user)
    {
        var sub = user.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? user.FindFirstValue("sub")
            ?? throw new HubException("Unauthorized");
        return Guid.Parse(sub);
    }

    private static Guid ParseDeviceId(ClaimsPrincipal user)
    {
        var deviceId = user.FindFirstValue("device_id")
            ?? throw new HubException("Unauthorized");
        return Guid.Parse(deviceId);
    }
}
