namespace GdotChat.Domain.Entities;

public class SignedPreKey
{
    public Guid Id { get; set; }
    public Guid DeviceId { get; set; }
    public Device Device { get; set; } = null!;
    public int KeyId { get; set; }
    public byte[] PublicKey { get; set; } = null!;
    public byte[] Signature { get; set; } = null!;
    public DateTimeOffset CreatedAt { get; set; }
}
