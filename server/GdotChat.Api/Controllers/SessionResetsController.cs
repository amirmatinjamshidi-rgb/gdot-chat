using GdotChat.Api.Extensions;
using GdotChat.Application.DTOs;
using GdotChat.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace GdotChat.Api.Controllers;

[Authorize]
[ApiController]
[Route("v1/session-resets")]
public class SessionResetsController : ControllerBase
{
    private readonly ISessionResetService _sessionResets;

    public SessionResetsController(ISessionResetService sessionResets) =>
        _sessionResets = sessionResets;

    [EnableRateLimiting("session-reset")]
    [HttpPost]
    public async Task<IActionResult> RequestAsync(
        [FromBody] SessionResetRequest request,
        CancellationToken ct)
    {
        await _sessionResets.RequestAsync(
            User.GetDeviceId(),
            User.GetUserId(),
            request.TargetDeviceId,
            ct);
        return NoContent();
    }
}
