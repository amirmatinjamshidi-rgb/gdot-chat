using GdotChat.Application.Security;
using Microsoft.AspNetCore.Authorization;

namespace GdotChat.Api.Authorization;

public sealed class ScopeAuthorizationHandler : AuthorizationHandler<ScopeRequirement>
{
    protected override Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        ScopeRequirement requirement)
    {
        var claim = context.User.FindFirst(AuthScopes.ClaimType)?.Value;
        if (AuthScopes.HasScope(claim, requirement.Scope))
            context.Succeed(requirement);
        return Task.CompletedTask;
    }
}
