using GdotChat.Application.DTOs;
using GdotChat.Application.Interfaces;
using GdotChat.Application.Mapping;
using GdotChat.Application.Options;
using GdotChat.Domain.Entities;
using GdotChat.Domain.Exceptions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace GdotChat.Application.Services;

public class GroupService : IGroupService
{
    public const int DefaultMaxMembers = 256;

    private readonly DbContext _db;
    private readonly IMessageNotifier _notifier;
    private readonly RelayOptions _relayOptions;
    private readonly GroupOptions _groupOptions;

    public GroupService(
        DbContext db,
        IMessageNotifier notifier,
        IOptions<RelayOptions> relayOptions,
        IOptions<GroupOptions> groupOptions)
    {
        _db = db;
        _notifier = notifier;
        _relayOptions = relayOptions.Value;
        _groupOptions = groupOptions.Value;
    }

    private int MaxMembers =>
        _groupOptions.MaxMembers > 0 ? _groupOptions.MaxMembers : DefaultMaxMembers;

    public async Task<GroupSummaryDto> CreateAsync(
        Guid callerUserId,
        Guid callerDeviceId,
        CreateGroupRequest request,
        CancellationToken ct = default)
    {
        var memberIds = (request.MemberUserIds ?? Array.Empty<Guid>())
            .Where(id => id != callerUserId)
            .Distinct()
            .ToList();

        // Creator + members
        if (memberIds.Count + 1 > MaxMembers)
            throw new GroupFullException();

        foreach (var uid in memberIds)
        {
            _ = await _db.Set<User>().FirstOrDefaultAsync(u => u.Id == uid, ct)
                ?? throw new UserNotFoundException();
        }

        byte[]? meta = null;
        if (!string.IsNullOrWhiteSpace(request.EncryptedMetadataBase64))
        {
            try { meta = DtoMapper.FromBase64(request.EncryptedMetadataBase64); }
            catch (FormatException)
            {
                throw new InvalidMessageRequestException("EncryptedMetadataBase64 is not valid Base64");
            }
        }

        var now = DateTimeOffset.UtcNow;
        var group = new ChatGroup
        {
            Id = Guid.NewGuid(),
            EncryptedMetadata = meta,
            CreatedByUserId = callerUserId,
            CreatedAt = now,
        };
        _db.Set<ChatGroup>().Add(group);

        _db.Set<GroupMember>().Add(new GroupMember
        {
            Id = Guid.NewGuid(),
            GroupId = group.Id,
            UserId = callerUserId,
            Role = GroupMemberRole.Admin,
            JoinedAt = now,
        });

        foreach (var uid in memberIds)
        {
            _db.Set<GroupMember>().Add(new GroupMember
            {
                Id = Guid.NewGuid(),
                GroupId = group.Id,
                UserId = uid,
                Role = GroupMemberRole.Member,
                JoinedAt = now,
            });
        }

        await _db.SaveChangesAsync(ct);

        await NotifyMembershipAsync(
            group.Id,
            "created",
            callerUserId,
            subjectUserId: null,
            now,
            ct);

        return await ToSummaryAsync(group.Id, callerUserId, ct);
    }

    public async Task<IReadOnlyList<GroupSummaryDto>> ListMyGroupsAsync(
        Guid callerUserId,
        CancellationToken ct = default)
    {
        var groupIds = await _db.Set<GroupMember>()
            .Where(m => m.UserId == callerUserId && m.LeftAt == null)
            .Select(m => m.GroupId)
            .ToListAsync(ct);

        var result = new List<GroupSummaryDto>();
        foreach (var gid in groupIds)
            result.Add(await ToSummaryAsync(gid, callerUserId, ct));
        return result.OrderByDescending(g => g.CreatedAt).ToList();
    }

    public async Task<IReadOnlyList<GroupMemberDto>> ListMembersAsync(
        Guid callerUserId,
        Guid groupId,
        CancellationToken ct = default)
    {
        await EnsureCurrentMemberAsync(groupId, callerUserId, ct);

        var rows = await _db.Set<GroupMember>()
            .Where(m => m.GroupId == groupId)
            .Join(_db.Set<User>(), m => m.UserId, u => u.Id, (m, u) => new { m, u.Username })
            .OrderBy(x => x.m.JoinedAt)
            .ToListAsync(ct);

        return rows.Select(x => new GroupMemberDto(
            x.m.UserId,
            x.Username,
            x.m.Role.ToString().ToLowerInvariant(),
            x.m.JoinedAt,
            x.m.LeftAt)).ToList();
    }

    public async Task AddMembersAsync(
        Guid callerUserId,
        Guid callerDeviceId,
        Guid groupId,
        AddGroupMembersRequest request,
        CancellationToken ct = default)
    {
        var me = await EnsureCurrentMemberAsync(groupId, callerUserId, ct);
        if (me.Role != GroupMemberRole.Admin)
            throw new GroupForbiddenException("Only admins can add members");

        var ids = (request.UserIds ?? Array.Empty<Guid>()).Distinct().ToList();
        if (ids.Count == 0)
            throw new InvalidMessageRequestException("UserIds required");

        var currentCount = await _db.Set<GroupMember>()
            .CountAsync(m => m.GroupId == groupId && m.LeftAt == null, ct);

        var now = DateTimeOffset.UtcNow;
        foreach (var uid in ids)
        {
            _ = await _db.Set<User>().FirstOrDefaultAsync(u => u.Id == uid, ct)
                ?? throw new UserNotFoundException();

            var existing = await _db.Set<GroupMember>()
                .FirstOrDefaultAsync(m => m.GroupId == groupId && m.UserId == uid, ct);

            if (existing is { LeftAt: null })
                continue; // already member

            if (currentCount + 1 > MaxMembers)
                throw new GroupFullException();

            if (existing is null)
            {
                _db.Set<GroupMember>().Add(new GroupMember
                {
                    Id = Guid.NewGuid(),
                    GroupId = groupId,
                    UserId = uid,
                    Role = GroupMemberRole.Member,
                    JoinedAt = now,
                });
            }
            else
            {
                existing.LeftAt = null;
                existing.JoinedAt = now;
                existing.Role = GroupMemberRole.Member;
            }

            currentCount += 1;
            await _db.SaveChangesAsync(ct);
            await NotifyMembershipAsync(groupId, "added", callerUserId, uid, now, ct);
        }
    }

    public async Task RemoveMemberAsync(
        Guid callerUserId,
        Guid callerDeviceId,
        Guid groupId,
        Guid subjectUserId,
        CancellationToken ct = default)
    {
        var me = await EnsureCurrentMemberAsync(groupId, callerUserId, ct);
        if (me.Role != GroupMemberRole.Admin)
            throw new GroupForbiddenException("Only admins can remove members");
        if (subjectUserId == callerUserId)
            throw new GroupForbiddenException("Use leave to remove yourself");

        var subject = await _db.Set<GroupMember>()
            .FirstOrDefaultAsync(m => m.GroupId == groupId && m.UserId == subjectUserId && m.LeftAt == null, ct)
            ?? throw new NotGroupMemberException();

        var now = DateTimeOffset.UtcNow;
        subject.LeftAt = now;
        await _db.SaveChangesAsync(ct);
        await NotifyMembershipAsync(groupId, "removed", callerUserId, subjectUserId, now, ct);
    }

    public async Task LeaveAsync(
        Guid callerUserId,
        Guid callerDeviceId,
        Guid groupId,
        CancellationToken ct = default)
    {
        var me = await EnsureCurrentMemberAsync(groupId, callerUserId, ct);
        var now = DateTimeOffset.UtcNow;
        me.LeftAt = now;

        // If last admin leaves, promote oldest remaining member.
        if (me.Role == GroupMemberRole.Admin)
        {
            var otherAdmins = await _db.Set<GroupMember>()
                .AnyAsync(
                    m => m.GroupId == groupId
                         && m.LeftAt == null
                         && m.UserId != callerUserId
                         && m.Role == GroupMemberRole.Admin,
                    ct);
            if (!otherAdmins)
            {
                var next = await _db.Set<GroupMember>()
                    .Where(m => m.GroupId == groupId && m.LeftAt == null && m.UserId != callerUserId)
                    .OrderBy(m => m.JoinedAt)
                    .FirstOrDefaultAsync(ct);
                if (next is not null)
                    next.Role = GroupMemberRole.Admin;
            }
        }

        await _db.SaveChangesAsync(ct);
        await NotifyMembershipAsync(groupId, "left", callerUserId, callerUserId, now, ct);
    }

    public async Task<SendGroupMessageResponse> SendAsync(
        Guid callerUserId,
        Guid callerDeviceId,
        Guid groupId,
        SendGroupMessageRequest request,
        CancellationToken ct = default)
    {
        await EnsureCurrentMemberAsync(groupId, callerUserId, ct);

        var expectedType = _groupOptions.SenderKeyMessageType > 0
            ? _groupOptions.SenderKeyMessageType
            : 4;
        if (request.MessageType != expectedType)
        {
            throw new InvalidMessageRequestException(
                $"MessageType must be {expectedType} (SenderKeyMessage)");
        }

        if (string.IsNullOrWhiteSpace(request.CiphertextBase64))
            throw new InvalidMessageRequestException("CiphertextBase64 is required");

        byte[] ciphertext;
        try { ciphertext = DtoMapper.FromBase64(request.CiphertextBase64); }
        catch (FormatException)
        {
            throw new InvalidMessageRequestException("CiphertextBase64 is not valid Base64");
        }

        if (ciphertext.Length == 0)
            throw new InvalidMessageRequestException("Ciphertext must not be empty");
        if (ciphertext.Length > _relayOptions.MaxCiphertextBytes)
        {
            throw new InvalidMessageRequestException(
                $"Ciphertext exceeds maximum of {_relayOptions.MaxCiphertextBytes} bytes");
        }

        var memberUserIds = await _db.Set<GroupMember>()
            .Where(m => m.GroupId == groupId && m.LeftAt == null)
            .Select(m => m.UserId)
            .ToListAsync(ct);

        var recipientDevices = await _db.Set<Device>()
            .Where(d => memberUserIds.Contains(d.UserId) && d.IsActive && d.Id != callerDeviceId)
            .Select(d => d.Id)
            .ToListAsync(ct);

        var now = DateTimeOffset.UtcNow;
        var expires = now.AddDays(_relayOptions.EnvelopeTtlDays);
        var envelopeIds = new List<Guid>();

        foreach (var recipientDeviceId in recipientDevices)
        {
            var id = Guid.NewGuid();
            envelopeIds.Add(id);
            _db.Set<MessageEnvelope>().Add(new MessageEnvelope
            {
                Id = id,
                SenderDeviceId = callerDeviceId,
                RecipientDeviceId = recipientDeviceId,
                MessageType = request.MessageType,
                Ciphertext = ciphertext,
                GroupId = groupId,
                CreatedAt = now,
                ExpiresAt = expires,
            });
        }

        await _db.SaveChangesAsync(ct);

        foreach (var (recipientDeviceId, envelopeId) in recipientDevices.Zip(envelopeIds))
            await _notifier.NotifyEnvelopeAvailableAsync(recipientDeviceId, envelopeId, ct);

        return new SendGroupMessageResponse(groupId, envelopeIds.Count, envelopeIds);
    }

    private async Task<GroupMember> EnsureCurrentMemberAsync(
        Guid groupId,
        Guid userId,
        CancellationToken ct)
    {
        _ = await _db.Set<ChatGroup>().FirstOrDefaultAsync(g => g.Id == groupId, ct)
            ?? throw new GroupNotFoundException();

        return await _db.Set<GroupMember>()
            .FirstOrDefaultAsync(m => m.GroupId == groupId && m.UserId == userId && m.LeftAt == null, ct)
            ?? throw new NotGroupMemberException();
    }

    private async Task<GroupSummaryDto> ToSummaryAsync(Guid groupId, Guid callerUserId, CancellationToken ct)
    {
        var group = await _db.Set<ChatGroup>().FirstAsync(g => g.Id == groupId, ct);
        var members = await _db.Set<GroupMember>()
            .Where(m => m.GroupId == groupId && m.LeftAt == null)
            .ToListAsync(ct);
        var mine = members.First(m => m.UserId == callerUserId);
        return new GroupSummaryDto(
            group.Id,
            group.EncryptedMetadata is null ? null : Convert.ToBase64String(group.EncryptedMetadata),
            group.CreatedByUserId,
            group.CreatedAt,
            members.Count,
            mine.Role.ToString().ToLowerInvariant());
    }

    private async Task NotifyMembershipAsync(
        Guid groupId,
        string change,
        Guid actorUserId,
        Guid? subjectUserId,
        DateTimeOffset at,
        CancellationToken ct)
    {
        var payload = new GroupMembershipChangedPayload(
            groupId, change, actorUserId, subjectUserId, at);

        // Notify all current members + subject (for removed/left so they learn immediately).
        var notifyUserIds = await _db.Set<GroupMember>()
            .Where(m => m.GroupId == groupId && m.LeftAt == null)
            .Select(m => m.UserId)
            .ToListAsync(ct);
        if (subjectUserId is Guid sid && !notifyUserIds.Contains(sid))
            notifyUserIds.Add(sid);

        var devices = await _db.Set<Device>()
            .Where(d => notifyUserIds.Contains(d.UserId) && d.IsActive)
            .Select(d => d.Id)
            .ToListAsync(ct);

        foreach (var deviceId in devices)
            await _notifier.NotifyGroupMembershipChangedAsync(deviceId, payload, ct);
    }
}
