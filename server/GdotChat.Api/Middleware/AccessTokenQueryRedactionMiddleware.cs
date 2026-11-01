using Microsoft.AspNetCore.WebUtilities;

namespace GdotChat.Api.Middleware;

/// <summary>
/// Moves hub <c>access_token</c> query values into <see cref="HttpContext.Items"/> and
/// strips them from the request query string so hosting/request logs never capture JWTs.
/// Must run before authentication. JwtBearer reads the token from Items (or remaining query).
/// </summary>
public sealed class AccessTokenQueryRedactionMiddleware
{
    public const string HubAccessTokenItemKey = "gdot.hubAccessToken";

    private readonly RequestDelegate _next;

    public AccessTokenQueryRedactionMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(HttpContext context)
    {
        var path = context.Request.Path;
        if (path.StartsWithSegments("/hubs"))
        {
            var token = context.Request.Query["access_token"].FirstOrDefault();
            if (!string.IsNullOrEmpty(token))
            {
                context.Items[HubAccessTokenItemKey] = token;
                context.Request.QueryString = RemoveAccessToken(context.Request.QueryString);
            }
        }

        await _next(context);
    }

    private static QueryString RemoveAccessToken(QueryString queryString)
    {
        if (!queryString.HasValue)
            return queryString;

        var parsed = QueryHelpers.ParseQuery(queryString.Value!);
        var kept = parsed
            .Where(kv => !string.Equals(kv.Key, "access_token", StringComparison.OrdinalIgnoreCase))
            .SelectMany(kv => kv.Value.Select(v => new KeyValuePair<string, string?>(kv.Key, v)))
            .ToList();

        if (kept.Count == 0)
            return QueryString.Empty;

        return QueryString.Create(kept);
    }
}
