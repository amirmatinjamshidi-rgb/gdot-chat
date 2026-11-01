namespace GdotChat.Application.DTOs;

public record CreateAttachmentRequest(
    Guid RecipientUserId,
    Guid RecipientDeviceId,
    long SizeBytes,
    Guid? GroupId = null);

public record CreateAttachmentResponse(
    Guid AttachmentId,
    int ChunkSizeBytes,
    int ChunkCount,
    DateTimeOffset ExpiresAt);

public record AttachmentStatusDto(
    Guid AttachmentId,
    long SizeBytes,
    int ChunkSizeBytes,
    int ChunkCount,
    IReadOnlyList<int> UploadedChunks,
    string Status,
    DateTimeOffset ExpiresAt);
