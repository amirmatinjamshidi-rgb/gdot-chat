using GdotChat.Application.DTOs;
using GdotChat.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace GdotChat.Api.Controllers;

[ApiController]
[Route("v1/auth")]
public class AuthController : ControllerBase
{
    private readonly IAuthService _authService;

    public AuthController(IAuthService authService) => _authService = authService;

    [AllowAnonymous]
    [EnableRateLimiting("auth-register")]
    [HttpPost("register")]
    public async Task<ActionResult<AuthResultDto>> RegisterAsync(
        [FromBody] RegisterRequest request,
        CancellationToken ct)
    {
        var result = await _authService.RegisterAsync(request, ct);
        return Created(string.Empty, result);
    }

    [AllowAnonymous]
    [EnableRateLimiting("auth-login")]
    [HttpPost("login")]
    public async Task<ActionResult<AuthResultDto>> LoginAsync(
        [FromBody] LoginRequest request,
        CancellationToken ct) =>
        Ok(await _authService.LoginAsync(request, ct));

    [AllowAnonymous]
    [EnableRateLimiting("auth-refresh")]
    [HttpPost("refresh")]
    public async Task<ActionResult<AuthResultDto>> RefreshAsync(
        [FromBody] RefreshRequest request,
        CancellationToken ct) =>
        Ok(await _authService.RefreshAsync(request.RefreshToken, ct));

    /// <summary>
    /// Password-based fallback to add a new device. Prefer link-token approval from an existing device.
    /// Rate limited (auth-login + in-memory per-username limiter).
    /// </summary>
    [AllowAnonymous]
    [EnableRateLimiting("auth-login")]
    [HttpPost("login-new-device")]
    public async Task<ActionResult<AuthResultDto>> LoginNewDeviceAsync(
        [FromBody] LoginNewDeviceRequest request,
        CancellationToken ct) =>
        Ok(await _authService.LoginNewDeviceAsync(request, ct));

    [AllowAnonymous]
    [EnableRateLimiting("auth-login")]
    [HttpPost("device-link")]
    public async Task<ActionResult<AuthResultDto>> RedeemDeviceLinkAsync(
        [FromBody] RedeemDeviceLinkRequest request,
        CancellationToken ct) =>
        Ok(await _authService.RedeemDeviceLinkAsync(request, ct));
}
