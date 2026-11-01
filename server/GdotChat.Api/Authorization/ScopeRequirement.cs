using Microsoft.AspNetCore.Authorization;

namespace GdotChat.Api.Authorization;

public sealed class ScopeRequirement : IAuthorizationRequirement
{
    public ScopeRequirement(string scope) => Scope = scope;

    public string Scope { get; }
}
