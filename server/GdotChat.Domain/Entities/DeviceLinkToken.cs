namespace GdotChat.Domain.Entities;

/// <summary>
/// Short-lived token created by an existing device so a new device can join the account.
/// </summary>
public class DeviceLinkToken
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;
    public Guid CreatedByDeviceId { get; set; }
    public Device CreatedByDevice { get; set; } = null!;
    public string TokenHash { get; set; } = null!;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? ConsumedAt { get; set; }
}
