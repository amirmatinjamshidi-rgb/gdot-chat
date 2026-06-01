using GdotChat.Application.DTOs;
using GdotChat.Application.Interfaces;
using GdotChat.Application.Mapping;
using GdotChat.Application.Options;
using GdotChat.Domain.Entities;
using GdotChat.Domain.Exceptions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace GdotChat.Application.Services;

public class DeviceService : IDeviceService
{
    private readonly DbContext _db;
    private readonly IMessageNotifier _notifier;
    private readonly RelayOptions _relayOptions;

    public DeviceService(
        DbContext db,
        IMessageNotifier notifier,
        IOptions<RelayOptions> relayOptions)
    {
        _db = db;
        _notifier = notifier;
        _relayOptions = relayOptions.Value;
    }

    public async Task<Device> RegisterDeviceWithPreKeysAsync(
        Guid userId,
        RegisterDeviceRequest request,
        CancellationToken ct = default)
    {
        var now = DateTimeOffset.UtcNow;
        var device = new Device
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Name = request.DeviceName,
            RegistrationId = request.RegistrationId,
            IdentityKeyPublic = DtoMapper.FromBase64(request.IdentityKeyPublicBase64),
            CreatedAt = now,
            LastSeenAt = now,
            IsActive = true,
        };
        _db.Set<Device>().Add(device);

        var spk = new SignedPreKey
        {
            Id = Guid.NewGuid(),
            DeviceId = device.Id,
            KeyId = request.SignedPreKey.KeyId,
            PublicKey = DtoMapper.FromBase64(request.SignedPreKey.PublicKeyBase64),
            Signature = DtoMapper.FromBase64(request.SignedPreKey.SignatureBase64),
            CreatedAt = now,
        };
        _db.Set<SignedPreKey>().Add(spk);

        foreach (var otk in request.OneTimePreKeys)
        {
            _db.Set<OneTimePreKey>().Add(new OneTimePreKey
            {
                Id = Guid.NewGuid(),
                DeviceId = device.Id,
                KeyId = otk.KeyId,
                PublicKey = DtoMapper.FromBase64(otk.PublicKeyBase64),
                IsConsumed = false,
            });
        }

        await _db.SaveChangesAsync(ct);
        return device;
    }

    public async Task UploadPreKeysAsync(
        Guid callerDeviceId,
        Guid deviceId,
        UploadPreKeysRequest request,
        CancellationToken ct = default)
    {
        if (callerDeviceId != deviceId)
            throw new ForbiddenDeviceException();

        var device = await _db.Set<Device>().FirstOrDefaultAsync(d => d.Id == deviceId, ct)
            ?? throw new DeviceNotFoundException();

        var now = DateTimeOffset.UtcNow;
        _db.Set<SignedPreKey>().Add(new SignedPreKey
        {
            Id = Guid.NewGuid(),
            DeviceId = device.Id,
            KeyId = request.SignedPreKey.KeyId,
            PublicKey = DtoMapper.FromBase64(request.SignedPreKey.PublicKeyBase64),
            Signature = DtoMapper.FromBase64(request.SignedPreKey.SignatureBase64),
            CreatedAt = now,
        });

        foreach (var otk in request.OneTimePreKeys)
        {
            _db.Set<OneTimePreKey>().Add(new OneTimePreKey
            {
                Id = Guid.NewGuid(),
                DeviceId = device.Id,
                KeyId = otk.KeyId,
                PublicKey = DtoMapper.FromBase64(otk.PublicKeyBase64),
                IsConsumed = false,
            });
        }

        await _db.SaveChangesAsync(ct);
    }

    public async Task<PreKeyBundleDto> GetPreKeyBundleAsync(
        Guid userId,
        Guid deviceId,
        CancellationToken ct = default)
    {
        var device = await _db.Set<Device>()
            .FirstOrDefaultAsync(d => d.Id == deviceId && d.UserId == userId && d.IsActive, ct)
            ?? throw new DeviceNotFoundException();

        var spk = await _db.Set<SignedPreKey>()
            .Where(k => k.DeviceId == deviceId)
            .OrderByDescending(k => k.CreatedAt)
            .FirstOrDefaultAsync(ct)
            ?? throw new DeviceNotFoundException();

        await using var tx = await _db.Database.BeginTransactionAsync(ct);

        var otk = await _db.Set<OneTimePreKey>()
            .FromSqlInterpolated($"""
                SELECT "Id", "DeviceId", "KeyId", "PublicKey", "IsConsumed", "ConsumedAt"
                FROM one_time_pre_keys
                WHERE "DeviceId" = {deviceId} AND "IsConsumed" = false
                ORDER BY "KeyId"
                LIMIT 1
                FOR UPDATE SKIP LOCKED
                """)
            .AsTracking()
            .FirstOrDefaultAsync(ct);

        if (otk is null)
        {
            await tx.RollbackAsync(ct);
            throw new PreKeysExhaustedException();
        }

        otk.IsConsumed = true;
        otk.ConsumedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        var remaining = await CountAvailableOneTimePreKeysAsync(deviceId, ct);
        if (remaining < _relayOptions.PreKeyLowThreshold)
        {
            await _notifier.NotifyPreKeysLowAsync(deviceId, remaining, ct);
        }

        return DtoMapper.ToBundleDto(device, spk, otk);
    }

    public async Task<IReadOnlyList<DeviceSummaryDto>> ListDevicesForUserAsync(
        Guid userId,
        CancellationToken ct = default)
    {
        var devices = await _db.Set<Device>()
            .Where(d => d.UserId == userId && d.IsActive)
            .OrderByDescending(d => d.LastSeenAt)
            .ToListAsync(ct);

        return devices.Select(DtoMapper.ToDto).ToList();
    }

    public Task<int> CountAvailableOneTimePreKeysAsync(Guid deviceId, CancellationToken ct = default) =>
        _db.Set<OneTimePreKey>().CountAsync(k => k.DeviceId == deviceId && !k.IsConsumed, ct);
}
