namespace GdotChat.Application.Options;

public class JwtOptions
{
    public const string SectionName = "Jwt";

    public string SigningKey { get; set; } = "dev-signing-key-min-32-characters-long!";
    public string Issuer { get; set; } = "gdot-chat";
    public string Audience { get; set; } = "gdot-chat-mobile";
    public int AccessTokenMinutes { get; set; } = 15;
    public int RefreshTokenDays { get; set; } = 30;
}
