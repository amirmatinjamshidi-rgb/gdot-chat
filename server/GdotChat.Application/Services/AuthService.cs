using System.Data;
using GdotChat.Application.DTOs;
using GdotChat.Application.Interfaces;
using GdotChat.Application.Options;
using GdotChat.Application.Security;
using GdotChat.Domain.Entities;
using GdotChat.Domain.Exceptions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace GdotChat.Application.Services;

public class AuthService : IAuthService
{
    /// <summary>
    /// Concurrent refresh losers (same token, same moment) must not trigger family revocation.
    /// Reuse after this window is treated as theft.
    /// </summary>
    private static readonly TimeSpan RefreshReuseTheftGrace = TimeSpan.FromSeconds(5);

    private readonly DbContext _db;
    private readonly IUserService _userService;
    private readonly IDeviceService _deviceService;
    private readonly IJwtTokenService _jwtTokenService;
    private readonly IPasswordHasher _passwordHasher;
    private readonly JwtOptions _jwtOptions;
    private readonly IDeviceLinkRateLimiter _deviceLinkRateLimiter;

    public AuthService(
        DbContext db,
        IUserService userService,
        IDeviceService deviceService,
        IJwtTokenService jwtTokenService,
        IPasswordHasher passwordHasher,
        IOptions<JwtOptions> jwtOptions,
        IDeviceLinkRateLimiter deviceLinkRateLimiter)
    {
        _db = db;
        _userService = userService;
        _deviceService = deviceService;
        _jwtTokenService = jwtTokenService;
        _passwordHasher = passwordHasher;
        _jwtOptions = jwtOptions.Value;
        _deviceLinkRateLimiter = deviceLinkRateLimiter;
    }

    public async Task<AuthResultDto> RegisterAsync(RegisterRequest request, CancellationToken ct = default)
    {
        PasswordPolicy.Validate(request.Password);

        var username = request.Username.Trim().ToLowerInvariant();
        if (await _userService.FindByUsernameAsync(username, ct) is not null)
            throw new UsernameTakenException();

        var passwordHash = _passwordHasher.Hash(request.Password);
        var user = await _userService.CreateUserAsync(username, passwordHash, ct);
        var device = await _deviceService.RegisterDeviceWithPreKeysAsync(user.Id, request.Device, ct);

        return await IssueTokensAsync(user, device, ct);
    }

    public async Task<AuthResultDto> LoginAsync(LoginRequest request, CancellationToken ct = default)
    {
        var username = request.Username.Trim().ToLowerInvariant();
        var user = await _userService.FindByUsernameAsync(username, ct)
            ?? throw new InvalidCredentialsException();

        if (!_passwordHasher.Verify(request.Password, user.PasswordHash))
            throw new InvalidCredentialsException();

        var device = await _db.Set<Device>()
            .FirstOrDefaultAsync(d => d.Id == request.DeviceId && d.UserId == user.Id && d.IsActive, ct)
            ?? throw new InvalidCredentialsException();

        device.LastSeenAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync(ct);

        return await IssueTokensAsync(user, device, ct);
    }

    public async Task<AuthResultDto> RefreshAsync(string refreshToken, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(refreshToken))
            throw new InvalidCredentialsException();

        var hash = _jwtTokenService.HashRefreshToken(refreshToken);
        var now = DateTimeOffset.UtcNow;

        await using var tx = await _db.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted, ct);

        // Atomic claim: only one concurrent refresh can revoke the active token.
        var claimed = await _db.Database.ExecuteSqlInterpolatedAsync($"""
            UPDATE refresh_tokens
            SET "RevokedAt" = {now}
            WHERE "TokenHash" = {hash}
              AND "RevokedAt" IS NULL
              AND "ExpiresAt" > {now}
            """, ct);

        if (claimed == 1)
        {
            var stored = await _db.Set<RefreshToken>()
                .AsTracking()
                .FirstAsync(t => t.TokenHash == hash, ct);

            var device = await _db.Set<Device>()
                .Include(d => d.User)
                .FirstAsync(d => d.Id == stored.DeviceId, ct);

            var result = await IssueTokensAsync(device.User, device, ct);
            await tx.CommitAsync(ct);
            return result;
        }

        var existing = await _db.Set<RefreshToken>()
            .FirstOrDefaultAsync(t => t.TokenHash == hash, ct);

        if (existing is null)
        {
            await tx.RollbackAsync(ct);
            throw new InvalidCredentialsException();
        }

        if (existing.RevokedAt is not null)
        {
            var revokedAge = now - existing.RevokedAt.Value;
            if (revokedAge > RefreshReuseTheftGrace)
            {
                await RevokeAllActiveForDeviceAsync(existing.DeviceId, now, ct);
                await _db.SaveChangesAsync(ct);
                await tx.CommitAsync(ct);
                throw new RefreshTokenReuseException();
            }

            await tx.RollbackAsync(ct);
            throw new InvalidCredentialsException();
        }

        await tx.RollbackAsync(ct);
        throw new InvalidCredentialsException();
    }


    public async Task<AuthResultDto> LoginNewDeviceAsync(LoginNewDeviceRequest request, CancellationToken ct = default)
    {
        var username = request.Username.Trim().ToLowerInvariant();
        if (!_deviceLinkRateLimiter.TryAcquireLoginNewDevice(username))
            throw new DeviceLinkRateLimitedException();

        var user = await _userService.FindByUsernameAsync(username, ct)
            ?? throw new InvalidCredentialsException();

        if (!_passwordHasher.Verify(request.Password, user.PasswordHash))
            throw new InvalidCredentialsException();

        var device = await _deviceService.RegisterDeviceWithPreKeysAsync(user.Id, request.Device, ct);
        return await IssueTokensAsync(user, device, ct);
    }

    public async Task<AuthResultDto> RedeemDeviceLinkAsync(RedeemDeviceLinkRequest request, CancellationToken ct = default)
    {
        var key = request.Token?.Trim() ?? "";
        if (!_deviceLinkRateLimiter.TryAcquireRedeem(key.Length > 16 ? key[..16] : key))
            throw new DeviceLinkRateLimitedException();

        var (user, device) = await _deviceService.RedeemLinkTokenAsync(request, ct);
        return await IssueTokensAsync(user, device, ct);
    }

    private async Task RevokeAllActiveForDeviceAsync(Guid deviceId, DateTimeOffset now, CancellationToken ct)
    {
        var active = await _db.Set<RefreshToken>()
            .Where(t => t.DeviceId == deviceId && t.RevokedAt == null)
            .ToListAsync(ct);
        foreach (var token in active)
            token.RevokedAt = now;
    }

    private async Task<AuthResultDto> IssueTokensAsync(User user, Device device, CancellationToken ct)
    {
        var accessToken = _jwtTokenService.CreateAccessToken(user, device);
        var refreshPlain = _jwtTokenService.CreateRefreshTokenPlaintext();
        var refreshHash = _jwtTokenService.HashRefreshToken(refreshPlain);
        var refreshDays = Math.Max(1, _jwtOptions.RefreshTokenDays);

        _db.Set<RefreshToken>().Add(new RefreshToken
        {
            Id = Guid.NewGuid(),
            DeviceId = device.Id,
            TokenHash = refreshHash,
            ExpiresAt = DateTimeOffset.UtcNow.AddDays(refreshDays),
        });
        await _db.SaveChangesAsync(ct);

        return new AuthResultDto(
            accessToken,
            refreshPlain,
            user.Id,
            device.Id,
            _jwtTokenService.GetAccessTokenExpiry());
    }
}
