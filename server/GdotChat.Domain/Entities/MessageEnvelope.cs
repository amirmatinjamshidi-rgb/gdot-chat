namespace GdotChat.Domain.Entities;

public class MessageEnvelope
{
    public Guid Id { get; set; }
    public Guid SenderDeviceId { get; set; }
    public Device SenderDevice { get; set; } = null!;
    public Guid RecipientDeviceId { get; set; }
    public Device RecipientDevice { get; set; } = null!;
    public int MessageType { get; set; }
    public byte[] Ciphertext { get; set; } = null!;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? DeliveredAt { get; set; }
}
