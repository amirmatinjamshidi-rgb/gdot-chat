using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using GdotChat.Application.DTOs;
using GdotChat.Application.Interfaces;
using GdotChat.Application.Security;
using GdotChat.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace GdotChat.Tests.Integration;

/// <summary>
/// E2E: random users; full-scoped login works; surgically scoped tokens are rejected where required.
/// </summary>
[Collection("Integration")]
public sealed class JwtScopeE2ETests
{
    private readonly GdotChatWebApplicationFactory _factory;
    private readonly HttpClient _client;

    public JwtScopeE2ETests(GdotChatWebApplicationFactory factory)
    {
        _factory = factory;
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task FullScopeToken_CanSendMessage_AndLimitedCannotFetchBundle()
    {
        var sender = await _client.RegisterAsync(TestData.CreateRegisterRequest(oneTimePreKeyCount: 3));
        var recipient = await _client.RegisterAsync(TestData.CreateRegisterRequest(oneTimePreKeyCount: 3));

        using var full = _factory.CreateClient();
        full.SetBearer(sender.AccessToken);
        var send = await full.PostAsJsonAsync(
            "/v1/messages",
            new SendMessageRequest(
                recipient.UserId,
                recipient.DeviceId,
                3,
                TestData.B64(48)));
        Assert.Equal(HttpStatusCode.Created, send.StatusCode);

        // Token with messages+users but without prekeys cannot fetch bundle.
        var limited = await MintAsync(sender.UserId, sender.DeviceId,
            [AuthScopes.Messages, AuthScopes.Users, AuthScopes.Devices]);
        using var narrow = _factory.CreateClient();
        narrow.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", limited);
        var bundle = await narrow.GetAsync(
            $"/v1/users/{recipient.UserId}/devices/{recipient.DeviceId}/prekey-bundle");
        Assert.Equal(HttpStatusCode.Forbidden, bundle.StatusCode);

        // Attachments without attachments scope → 403
        var noAttach = await MintAsync(sender.UserId, sender.DeviceId, [AuthScopes.Messages]);
        using var noAttClient = _factory.CreateClient();
        noAttClient.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", noAttach);
        var att = await noAttClient.PostAsJsonAsync(
            "/v1/attachments",
            new CreateAttachmentRequest(recipient.UserId, recipient.DeviceId, 1024));
        Assert.Equal(HttpStatusCode.Forbidden, att.StatusCode);
    }

    private async Task<string> MintAsync(Guid userId, Guid deviceId, IReadOnlyCollection<string> scopes)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<DbContext>();
        var jwt = scope.ServiceProvider.GetRequiredService<IJwtTokenService>();
        var user = await db.Set<User>().FirstAsync(u => u.Id == userId);
        var device = await db.Set<Device>().FirstAsync(d => d.Id == deviceId);
        return jwt.CreateAccessToken(user, device, scopes);
    }
}
