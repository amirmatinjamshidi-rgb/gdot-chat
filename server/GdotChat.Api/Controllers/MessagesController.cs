using GdotChat.Api.Extensions;
using GdotChat.Application.DTOs;
using GdotChat.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace GdotChat.Api.Controllers;

[Authorize]
[ApiController]
[Route("v1/messages")]
public class MessagesController : ControllerBase
{
    private readonly IMessageRelayService _messageRelayService;

    public MessagesController(IMessageRelayService messageRelayService) =>
        _messageRelayService = messageRelayService;

    [EnableRateLimiting("messages-send")]
    [HttpPost]
    public async Task<ActionResult<SendMessageResponse>> SendAsync(
        [FromBody] SendMessageRequest request,
        CancellationToken ct)
    {
        var senderDeviceId = User.GetDeviceId();
        var envelopeId = await _messageRelayService.EnqueueAsync(senderDeviceId, request, ct);
        return Created(string.Empty, new SendMessageResponse(envelopeId));
    }

    [HttpGet("pending")]
    public async Task<ActionResult<IReadOnlyList<MessageEnvelopeDto>>> GetPendingAsync(
        [FromQuery] int limit = 50,
        CancellationToken ct = default)
    {
        var deviceId = User.GetDeviceId();
        return Ok(await _messageRelayService.GetPendingForDeviceAsync(deviceId, limit, ct));
    }

    [HttpPost("{envelopeId:guid}/ack")]
    public async Task<IActionResult> AckAsync(Guid envelopeId, CancellationToken ct)
    {
        var deviceId = User.GetDeviceId();
        await _messageRelayService.AckAsync(deviceId, envelopeId, ct);
        return NoContent();
    }
}
