namespace GdotChat.Domain.Entities;

public class ChatGroup
{
    public Guid Id { get; set; }
    /// <summary>Opaque client-encrypted metadata (name/avatar). Server never interprets.</summary>
    public byte[]? EncryptedMetadata { get; set; }
    public Guid CreatedByUserId { get; set; }
    public User CreatedByUser { get; set; } = null!;
    public DateTimeOffset CreatedAt { get; set; }
    public ICollection<GroupMember> Members { get; set; } = new List<GroupMember>();
}
