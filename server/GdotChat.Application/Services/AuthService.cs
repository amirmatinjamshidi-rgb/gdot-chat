using GdotChat.Application.DTOs;
using GdotChat.Application.Interfaces;
using GdotChat.Domain.Entities;
using GdotChat.Domain.Exceptions;
using Microsoft.EntityFrameworkCore;

namespace GdotChat.Application.Services;

public class AuthService : IAuthService
{
    private readonly DbContext _db;
    private readonly IUserService _userService;
    private readonly IDeviceService _deviceService;
    private readonly IJwtTokenService _jwtTokenService;
    private readonly IPasswordHasher _passwordHasher;

    public AuthService(
        DbContext db,
        IUserService userService,
        IDeviceService deviceService,
        IJwtTokenService jwtTokenService,
        IPasswordHasher passwordHasher)
    {
        _db = db;
        _userService = userService;
        _deviceService = deviceService;
        _jwtTokenService = jwtTokenService;
        _passwordHasher = passwordHasher;
    }

    public async Task<AuthResultDto> RegisterAsync(RegisterRequest request, CancellationToken ct = default)
    {
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
        var hash = _jwtTokenService.HashRefreshToken(refreshToken);
        var stored = await _db.Set<RefreshToken>()
            .Include(t => t.Device)
            .ThenInclude(d => d.User)
            .FirstOrDefaultAsync(
                t => t.TokenHash == hash && t.RevokedAt == null && t.ExpiresAt > DateTimeOffset.UtcNow,
                ct)
            ?? throw new InvalidCredentialsException();

        stored.RevokedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync(ct);

        return await IssueTokensAsync(stored.Device.User, stored.Device, ct);
    }

    private async Task<AuthResultDto> IssueTokensAsync(User user, Device device, CancellationToken ct)
    {
        var accessToken = _jwtTokenService.CreateAccessToken(user, device);
        var refreshPlain = _jwtTokenService.CreateRefreshTokenPlaintext();
        var refreshHash = _jwtTokenService.HashRefreshToken(refreshPlain);

        _db.Set<RefreshToken>().Add(new RefreshToken
        {
            Id = Guid.NewGuid(),
            DeviceId = device.Id,
            TokenHash = refreshHash,
            ExpiresAt = DateTimeOffset.UtcNow.AddDays(30),
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
