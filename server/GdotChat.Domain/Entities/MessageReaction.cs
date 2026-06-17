namespace GdotChat.Domain.Entities;

public class MessageReaction
{
    public Guid Id { get; set; }
    public string MessageClientId { get; set; } = "";
    public string ConversationId { get; set; } = "";
    public string? ServerEnvelopeId { get; set; }
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;
    public Guid RecipientDeviceId { get; set; }
    public Device RecipientDevice { get; set; } = null!;
    public string Emoji { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
}
