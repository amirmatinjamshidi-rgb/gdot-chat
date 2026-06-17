using GdotChat.Api.Extensions;
using GdotChat.Application.DTOs;
using GdotChat.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GdotChat.Api.Controllers;

[Authorize]
[ApiController]
[Route("v1/messages")]
public class ReactionsController : ControllerBase
{
    private readonly IReactionService _reactionService;

    public ReactionsController(IReactionService reactionService) =>
        _reactionService = reactionService;

    [HttpPost("reactions")]
    public async Task<IActionResult> SendReactionAsync(
        [FromBody] ReactionRequest request,
        CancellationToken ct)
    {
        var userId = User.GetUserId();
        var deviceId = User.GetDeviceId();
        await _reactionService.ToggleAndNotifyAsync(userId, deviceId, request, ct);
        return NoContent();
    }
}
