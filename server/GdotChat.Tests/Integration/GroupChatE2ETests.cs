using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using GdotChat.Application.DTOs;

namespace GdotChat.Tests.Integration;

/// <summary>
/// Multi-step E2E: create → send → remove (no decrypt path for removed) → re-add → send again.
/// Ciphertexts are opaque on the server; membership gating is the server contract under test.
/// </summary>
[Collection("Integration")]
public sealed class GroupChatE2ETests
{
    private readonly GdotChatWebApplicationFactory _factory;
    private readonly HttpClient _client;

    public GroupChatE2ETests(GdotChatWebApplicationFactory factory)
    {
        _factory = factory;
        _client = factory.CreateClient();
    }

    private static string Cipher() =>
        Convert.ToBase64String(RandomNumberGenerator.GetBytes(64));

    [Fact]
    public async Task MembershipLifecycle_ControlsRelayFanOut()
    {
        async Task<(AuthResultDto a, HttpClient c)> Reg()
        {
            var a = await _client.RegisterAsync();
            var c = _factory.CreateClient();
            c.SetBearer(a.AccessToken);
            return (a, c);
        }

        var (admin, adminC) = await Reg();
        var (bob, bobC) = await Reg();
        var (carol, carolC) = await Reg();

        var group = (await (await adminC.PostAsJsonAsync(
            "/v1/groups",
            new CreateGroupRequest([bob.UserId, carol.UserId], Cipher()))).Content
            .ReadFromJsonAsync<GroupSummaryDto>())!;

        // Concurrent-ish sends during "rotation window" (membership stable): both succeed.
        var t1 = adminC.PostAsJsonAsync(
            $"/v1/groups/{group.Id}/messages", new SendGroupMessageRequest(4, Cipher()));
        var t2 = bobC.PostAsJsonAsync(
            $"/v1/groups/{group.Id}/messages", new SendGroupMessageRequest(4, Cipher()));
        var r = await Task.WhenAll(t1, t2);
        Assert.All(r, x => x.EnsureSuccessStatusCode());

        await adminC.PostAsJsonAsync(
            $"/v1/groups/{group.Id}/members/remove",
            new RemoveGroupMemberRequest(bob.UserId));

        var bobDenied = await bobC.PostAsJsonAsync(
            $"/v1/groups/{group.Id}/messages", new SendGroupMessageRequest(4, Cipher()));
        Assert.Equal(HttpStatusCode.Forbidden, bobDenied.StatusCode);

        // New ciphertext after removal fans out only to remaining members (carol), not bob.
        // Clear bob inbox first.
        var old = await bobC.GetFromJsonAsync<List<MessageEnvelopeDto>>("/v1/messages/pending?limit=50");
        foreach (var e in old ?? [])
            await bobC.PostAsync($"/v1/messages/{e.Id}/ack", null);

        await adminC.PostAsJsonAsync(
            $"/v1/groups/{group.Id}/messages", new SendGroupMessageRequest(4, Cipher()));
        var bobAfter = await bobC.GetFromJsonAsync<List<MessageEnvelopeDto>>("/v1/messages/pending?limit=20");
        Assert.DoesNotContain(bobAfter!, e => e.GroupId == group.Id);

        var carolPending = await carolC.GetFromJsonAsync<List<MessageEnvelopeDto>>("/v1/messages/pending?limit=50");
        Assert.Contains(carolPending!, e => e.GroupId == group.Id);

        // Re-add bob — can receive again.
        await adminC.PostAsJsonAsync(
            $"/v1/groups/{group.Id}/members",
            new AddGroupMembersRequest([bob.UserId]));
        await adminC.PostAsJsonAsync(
            $"/v1/groups/{group.Id}/messages", new SendGroupMessageRequest(4, Cipher()));
        var bobBack = await bobC.GetFromJsonAsync<List<MessageEnvelopeDto>>("/v1/messages/pending?limit=20");
        Assert.Contains(bobBack!, e => e.GroupId == group.Id);
    }
}
