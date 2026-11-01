using GdotChat.Application.Security;
using Microsoft.AspNetCore.Authorization;

namespace GdotChat.Api.Authorization;

public static class ScopePolicies
{
    public const string Messages = "scope:" + AuthScopes.Messages;
    public const string Prekeys = "scope:" + AuthScopes.Prekeys;
    public const string Attachments = "scope:" + AuthScopes.Attachments;
    public const string Devices = "scope:" + AuthScopes.Devices;
    public const string Session = "scope:" + AuthScopes.Session;
    public const string Users = "scope:" + AuthScopes.Users;

    public static void AddScopePolicies(this AuthorizationOptions options)
    {
        void Add(string policyName, string scope) =>
            options.AddPolicy(policyName, p => p.Requirements.Add(new ScopeRequirement(scope)));

        Add(Messages, AuthScopes.Messages);
        Add(Prekeys, AuthScopes.Prekeys);
        Add(Attachments, AuthScopes.Attachments);
        Add(Devices, AuthScopes.Devices);
        Add(Session, AuthScopes.Session);
        Add(Users, AuthScopes.Users);
    }
}
