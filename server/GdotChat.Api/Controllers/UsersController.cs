using GdotChat.Api.Extensions;
using GdotChat.Application.DTOs;
using GdotChat.Application.Interfaces;
using GdotChat.Application.Mapping;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace GdotChat.Api.Controllers;

[Authorize]
[ApiController]
[Route("v1/users")]
public class UsersController : ControllerBase
{
    private readonly IUserService _userService;
    private readonly IDeviceService _deviceService;

    public UsersController(IUserService userService, IDeviceService deviceService)
    {
        _userService = userService;
        _deviceService = deviceService;
    }

    [EnableRateLimiting("users-search")]
    [HttpGet("search")]
    public async Task<ActionResult<IReadOnlyList<UserSummaryDto>>> SearchAsync(
        [FromQuery] string q,
        [FromQuery] int limit = 20,
        CancellationToken ct = default) =>
        Ok(await _userService.SearchByUsernameAsync(q, limit, ct));

    [HttpGet("{userId:guid}")]
    public async Task<ActionResult<UserSummaryDto>> GetProfileAsync(Guid userId, CancellationToken ct)
    {
        var user = await _userService.GetByIdAsync(userId, ct);
        return Ok(DtoMapper.ToDto(user));
    }

    [HttpGet("{userId:guid}/devices")]
    public async Task<ActionResult<IReadOnlyList<DeviceSummaryDto>>> ListDevicesAsync(
        Guid userId,
        CancellationToken ct) =>
        Ok(await _deviceService.ListDevicesForUserAsync(userId, ct));

    [HttpGet("{userId:guid}/devices/{deviceId:guid}/prekey-bundle")]
    public async Task<ActionResult<PreKeyBundleDto>> GetPreKeyBundleAsync(
        Guid userId,
        Guid deviceId,
        CancellationToken ct) =>
        Ok(await _deviceService.GetPreKeyBundleAsync(userId, deviceId, ct));
}
