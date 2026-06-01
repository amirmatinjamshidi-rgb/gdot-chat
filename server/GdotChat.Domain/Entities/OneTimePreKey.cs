namespace GdotChat.Domain.Entities;

public class OneTimePreKey
{
    public Guid Id { get; set; }
    public Guid DeviceId { get; set; }
    public Device Device { get; set; } = null!;
    public int KeyId { get; set; }
    public byte[] PublicKey { get; set; } = null!;
    public bool IsConsumed { get; set; }
    public DateTimeOffset? ConsumedAt { get; set; }
}
