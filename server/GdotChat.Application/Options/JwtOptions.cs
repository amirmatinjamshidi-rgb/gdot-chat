namespace GdotChat.Application.Options;

public class JwtOptions
{
    public const string SectionName = "Jwt";

    /// <summary>
    /// HMAC signing key. Must come from env / user-secrets / Testing config — not committed.
    /// Minimum 32 characters outside Development-with-ephemeral-dev-key.
    /// </summary>
    public string SigningKey { get; set; } = "";

    /// <summary>
    /// Development only: when true, Program.cs uses a fixed in-process ephemeral key
    /// if SigningKey is unset. Never enable outside Development.
    /// </summary>
    public bool UseEphemeralDevelopmentSigningKey { get; set; }

    public string Issuer { get; set; } = "gdot-chat";
    public string Audience { get; set; } = "gdot-chat-mobile";
    public int AccessTokenMinutes { get; set; } = 15;
    public int RefreshTokenDays { get; set; } = 30;
}
