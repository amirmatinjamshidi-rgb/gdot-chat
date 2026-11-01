using GdotChat.Domain.Enums;

namespace GdotChat.Domain.Entities;

public class Attachment
{
    public Guid Id { get; set; }
    public Guid SenderDeviceId { get; set; }
    public Device SenderDevice { get; set; } = null!;
    public Guid RecipientDeviceId { get; set; }
    public Device RecipientDevice { get; set; } = null!;
    /// <summary>When set, any current group member may download; recipient device is a sentinel.</summary>
    public Guid? GroupId { get; set; }
    public ChatGroup? Group { get; set; }
    public long PlainSizeBytes { get; set; }
    public int ChunkSizeBytes { get; set; }
    public int ChunkCount { get; set; }
    public AttachmentStatus Status { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
    public DateTimeOffset? DownloadedAt { get; set; }
}
