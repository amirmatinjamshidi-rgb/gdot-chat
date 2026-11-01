namespace GdotChat.Application.Security;

/// <summary>
/// OAuth-style space-delimited scopes carried in the JWT <c>scope</c> claim.
/// Normal login/register/refresh issues the full user set so existing clients keep working.
/// </summary>
public static class AuthScopes
{
    public const string ClaimType = "scope";

    public const string Messages = "messages";
    public const string Prekeys = "prekeys";
    public const string Attachments = "attachments";
    public const string Devices = "devices";
    public const string Session = "session";
    public const string Users = "users";
    public const string Groups = "groups";

    public static readonly string[] AllUserScopes =
    [
        Messages,
        Prekeys,
        Attachments,
        Devices,
        Session,
        Users,
        Groups,
    ];

    public static string Format(IEnumerable<string> scopes) =>
        string.Join(' ', scopes.Distinct(StringComparer.Ordinal));

    public static IReadOnlyList<string> Parse(string? scopeClaim)
    {
        if (string.IsNullOrWhiteSpace(scopeClaim))
            return Array.Empty<string>();
        return scopeClaim
            .Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
    }

    public static bool HasScope(string? scopeClaim, string required) =>
        Parse(scopeClaim).Contains(required, StringComparer.Ordinal);
}
