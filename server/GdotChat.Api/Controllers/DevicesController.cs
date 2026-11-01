using GdotChat.Api.Authorization;
using GdotChat.Api.Extensions;
using GdotChat.Application.DTOs;
using GdotChat.Application.Interfaces;
using GdotChat.Application.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GdotChat.Api.Controllers;

[Authorize(Policy = ScopePolicies.Devices)]
[ApiController]
[Route("v1/devices")]
public class DevicesController : ControllerBase
{
    private readonly IDeviceService _deviceService;
    private readonly IDeviceLinkRateLimiter _linkRateLimiter;

    public DevicesController(IDeviceService deviceService, IDeviceLinkRateLimiter linkRateLimiter)
    {
        _deviceService = deviceService;
        _linkRateLimiter = linkRateLimiter;
    }

    [Authorize(Policy = ScopePolicies.Prekeys)]
    [HttpPut("{deviceId:guid}/prekeys")]
    public async Task<IActionResult> UploadPreKeysAsync(
        Guid deviceId,
        [FromBody] UploadPreKeysRequest request,
        CancellationToken ct)
    {
        var callerDeviceId = User.GetDeviceId();
        await _deviceService.UploadPreKeysAsync(callerDeviceId, deviceId, request, ct);
        return NoContent();
    }

    /// <summary>List devices belonging to the authenticated user.</summary>
    [HttpGet("me")]
    public async Task<ActionResult<IReadOnlyList<DeviceSummaryDto>>> ListMyDevicesAsync(CancellationToken ct) =>
        Ok(await _deviceService.ListDevicesForUserAsync(User.GetUserId(), ct));

    /// <summary>
    /// Existing device creates a short-lived link token (QR / deep link) for approving a new device.
    /// </summary>
    [HttpPost("link-tokens")]
    public async Task<ActionResult<CreateDeviceLinkTokenResponse>> CreateLinkTokenAsync(CancellationToken ct)
    {
        var deviceId = User.GetDeviceId();
        if (!_linkRateLimiter.TryAcquireCreate(deviceId))
            return StatusCode(StatusCodes.Status429TooManyRequests);
        var result = await _deviceService.CreateLinkTokenAsync(User.GetUserId(), deviceId, ct);
        return Ok(result);
    }
}
