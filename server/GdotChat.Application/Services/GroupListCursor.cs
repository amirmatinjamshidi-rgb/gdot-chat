using System.Globalization;
using System.Text;

namespace GdotChat.Application.Services;

/// <summary>
/// Opaque cursor for group list pagination. Ordered by ChatGroup.LastActivityAt DESC, Id DESC.
/// Format (before base64url): "{utcTicks}/{groupId:N}"
/// </summary>
public static class GroupListCursor
{
    public static string Encode(DateTimeOffset lastActivityAt, Guid groupId)
    {
        var raw = lastActivityAt.UtcTicks.ToString(CultureInfo.InvariantCulture) + "/" + groupId.ToString("N");
        return Base64UrlEncode(Encoding.UTF8.GetBytes(raw));
    }

    public static bool TryDecode(string? cursor, out DateTimeOffset lastActivityAt, out Guid groupId)
    {
        lastActivityAt = default;
        groupId = default;
        if (string.IsNullOrWhiteSpace(cursor))
            return false;

        byte[] bytes;
        try { bytes = Base64UrlDecode(cursor.Trim()); }
        catch (FormatException) { return false; }

        var raw = Encoding.UTF8.GetString(bytes);
        var slash = raw.IndexOf('/');
        if (slash <= 0 || slash >= raw.Length - 1)
            return false;

        if (!long.TryParse(
                raw.AsSpan(0, slash),
                NumberStyles.Integer,
                CultureInfo.InvariantCulture,
                out var ticks))
            return false;

        if (!Guid.TryParseExact(raw.AsSpan(slash + 1), "N", out groupId))
            return false;

        lastActivityAt = new DateTimeOffset(ticks, TimeSpan.Zero);
        return true;
    }

    private static string Base64UrlEncode(byte[] data) =>
        Convert.ToBase64String(data)
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');

    private static byte[] Base64UrlDecode(string input)
    {
        var s = input.Replace('-', '+').Replace('_', '/');
        switch (s.Length % 4)
        {
            case 2: s += "=="; break;
            case 3: s += "="; break;
        }
        return Convert.FromBase64String(s);
    }
}
