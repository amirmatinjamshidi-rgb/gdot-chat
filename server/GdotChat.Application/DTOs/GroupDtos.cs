namespace GdotChat.Application.DTOs;

public record CreateGroupRequest(
    IReadOnlyList<Guid> MemberUserIds,
    string? EncryptedMetadataBase64);

public record GroupSummaryDto(
    Guid Id,
    string? EncryptedMetadataBase64,
    Guid CreatedByUserId,
    DateTimeOffset CreatedAt,
    int MemberCount,
    string MyRole);

public record GroupMemberDto(
    Guid UserId,
    string Username,
    string Role,
    DateTimeOffset JoinedAt,
    DateTimeOffset? LeftAt);

public record AddGroupMembersRequest(IReadOnlyList<Guid> UserIds);

public record RemoveGroupMemberRequest(Guid UserId);

public record SendGroupMessageRequest(
    int MessageType,
    string CiphertextBase64);

public record SendGroupMessageResponse(
    Guid GroupId,
    int FanOutCount,
    IReadOnlyList<Guid> EnvelopeIds);

public record GroupMembershipChangedPayload(
    Guid GroupId,
    string Change,
    Guid ActorUserId,
    Guid? SubjectUserId,
    DateTimeOffset At);

public record GroupListPageDto(
    IReadOnlyList<GroupSummaryDto> Items,
    string? NextCursor);
