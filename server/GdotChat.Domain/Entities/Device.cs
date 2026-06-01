namespace GdotChat.Domain.Entities;

public class Device
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;
    public string Name { get; set; } = null!;
    public int RegistrationId { get; set; }
    public byte[] IdentityKeyPublic { get; set; } = null!;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset LastSeenAt { get; set; }
    public bool IsActive { get; set; } = true;
    public ICollection<SignedPreKey> SignedPreKeys { get; set; } = [];
    public ICollection<OneTimePreKey> OneTimePreKeys { get; set; } = [];
    public ICollection<RefreshToken> RefreshTokens { get; set; } = [];
}
