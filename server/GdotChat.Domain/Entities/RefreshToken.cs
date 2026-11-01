namespace GdotChat.Domain.Entities;

public class RefreshToken
{
    public Guid Id { get; set; }
    public Guid DeviceId { get; set; }
    public Device Device { get; set; } = null!;
    public string TokenHash { get; set; } = null!;
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? RevokedAt { get; set; }

    /// <summary>Successor refresh-token row created when this token was rotated.</summary>
    public Guid? ReplacedByTokenId { get; set; }

    /// <summary>
    /// AES-GCM ciphertext of the AuthResult issued at rotation (access+refresh).
    /// Present only while reuse-within-grace must be idempotent; cleared on theft/expiry.
    /// Never stores plaintext refresh tokens.
    /// </summary>
    public string? SuccessorCiphertext { get; set; }
}
