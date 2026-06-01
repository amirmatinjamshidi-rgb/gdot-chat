using GdotChat.Api.Extensions;
using GdotChat.Application.DTOs;
using GdotChat.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GdotChat.Api.Controllers;

[Authorize]
[ApiController]
[Route("v1/devices")]
public class DevicesController : ControllerBase
{
    private readonly IDeviceService _deviceService;

    public DevicesController(IDeviceService deviceService) => _deviceService = deviceService;

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
}
