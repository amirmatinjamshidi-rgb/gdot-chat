using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using GdotChat.Application.DTOs;

namespace GdotChat.Tests.Integration;

[Collection("Integration")]
public sealed class GroupChatTests
{
    private readonly HttpClient _client;
    private readonly GdotChatWebApplicationFactory _factory;

    public GroupChatTests(GdotChatWebApplicationFactory factory)
    {
        _factory = factory;
        _client = factory.CreateClient();
    }

    private static string RandomCipherB64(int n = 48) =>
        Convert.ToBase64String(RandomNumberGenerator.GetBytes(n));

    private async Task<(AuthResultDto Auth, HttpClient Client)> RegisterClientAsync()
    {
        var auth = await _client.RegisterAsync();
        var c = _factory.CreateClient();
        c.SetBearer(auth.AccessToken);
        return (auth, c);
    }

    [Fact]
    public async Task Create_Add_List_Remove_Leave_Flow()
    {
        var (admin, adminClient) = await RegisterClientAsync();
        var (m1, m1Client) = await RegisterClientAsync();
        var (m2, _) = await RegisterClientAsync();

        var create = await adminClient.PostAsJsonAsync(
            "/v1/groups",
            new CreateGroupRequest([m1.UserId, m2.UserId], Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))));
        create.EnsureSuccessStatusCode();
        var group = (await create.Content.ReadFromJsonAsync<GroupSummaryDto>())!;
        Assert.Equal(3, group.MemberCount);
        Assert.Equal("admin", group.MyRole);

        var mine = await m1Client.GetFromJsonAsync<List<GroupSummaryDto>>("/v1/groups");
        Assert.Contains(mine!, g => g.Id == group.Id);

        var members = await adminClient.GetFromJsonAsync<List<GroupMemberDto>>(
            $"/v1/groups/{group.Id}/members");
        Assert.Equal(3, members!.Count(m => m.LeftAt is null));

        var (m3, m3Client) = await RegisterClientAsync();
        var add = await adminClient.PostAsJsonAsync(
            $"/v1/groups/{group.Id}/members",
            new AddGroupMembersRequest([m3.UserId]));
        Assert.Equal(HttpStatusCode.NoContent, add.StatusCode);

        var remove = await adminClient.PostAsJsonAsync(
            $"/v1/groups/{group.Id}/members/remove",
            new RemoveGroupMemberRequest(m1.UserId));
        Assert.Equal(HttpStatusCode.NoContent, remove.StatusCode);

        // Removed member cannot list members
        var forbidden = await m1Client.GetAsync($"/v1/groups/{group.Id}/members");
        Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);

        var leave = await m3Client.PostAsync($"/v1/groups/{group.Id}/leave", null);
        Assert.Equal(HttpStatusCode.NoContent, leave.StatusCode);
    }

    [Fact]
    public async Task Send_FansOut_ToMemberDevices_AndRejectsNonMember()
    {
        var (admin, adminClient) = await RegisterClientAsync();
        var (bob, bobClient) = await RegisterClientAsync();
        var (carol, carolClient) = await RegisterClientAsync();
        var (outsider, outsiderClient) = await RegisterClientAsync();

        var group = (await (await adminClient.PostAsJsonAsync(
            "/v1/groups",
            new CreateGroupRequest([bob.UserId, carol.UserId], null))).Content
            .ReadFromJsonAsync<GroupSummaryDto>())!;

        var cipher = RandomCipherB64();
        var send = await adminClient.PostAsJsonAsync(
            $"/v1/groups/{group.Id}/messages",
            new SendGroupMessageRequest(4, cipher));
        send.EnsureSuccessStatusCode();
        var sent = (await send.Content.ReadFromJsonAsync<SendGroupMessageResponse>())!;
        Assert.Equal(2, sent.FanOutCount); // bob + carol devices (not admin's own)

        var bobPending = await bobClient.GetFromJsonAsync<List<MessageEnvelopeDto>>(
            "/v1/messages/pending?limit=20");
        Assert.Contains(bobPending!, e => e.GroupId == group.Id && e.MessageType == 4);

        var reject = await outsiderClient.PostAsJsonAsync(
            $"/v1/groups/{group.Id}/messages",
            new SendGroupMessageRequest(4, RandomCipherB64()));
        Assert.Equal(HttpStatusCode.Forbidden, reject.StatusCode);

        // After remove, bob cannot send; new message not delivered to bob
        await adminClient.PostAsJsonAsync(
            $"/v1/groups/{group.Id}/members/remove",
            new RemoveGroupMemberRequest(bob.UserId));

        var bobSend = await bobClient.PostAsJsonAsync(
            $"/v1/groups/{group.Id}/messages",
            new SendGroupMessageRequest(4, RandomCipherB64()));
        Assert.Equal(HttpStatusCode.Forbidden, bobSend.StatusCode);

        // Ack prior bob envelopes then send new from admin — bob should not receive
        foreach (var e in bobPending!.Where(e => e.GroupId == group.Id))
            await bobClient.PostAsync($"/v1/messages/{e.Id}/ack", null);

        var send2 = await adminClient.PostAsJsonAsync(
            $"/v1/groups/{group.Id}/messages",
            new SendGroupMessageRequest(4, RandomCipherB64()));
        send2.EnsureSuccessStatusCode();
        var after = await bobClient.GetFromJsonAsync<List<MessageEnvelopeDto>>(
            "/v1/messages/pending?limit=20");
        Assert.DoesNotContain(after!, e => e.GroupId == group.Id && e.MessageType == 4);
    }

    [Fact]
    public async Task ReAdd_Member_CanReceiveAgain()
    {
        var (admin, adminClient) = await RegisterClientAsync();
        var (bob, bobClient) = await RegisterClientAsync();

        var group = (await (await adminClient.PostAsJsonAsync(
            "/v1/groups",
            new CreateGroupRequest([bob.UserId], null))).Content
            .ReadFromJsonAsync<GroupSummaryDto>())!;

        await adminClient.PostAsJsonAsync(
            $"/v1/groups/{group.Id}/members/remove",
            new RemoveGroupMemberRequest(bob.UserId));
        await adminClient.PostAsJsonAsync(
            $"/v1/groups/{group.Id}/members",
            new AddGroupMembersRequest([bob.UserId]));

        var send = await adminClient.PostAsJsonAsync(
            $"/v1/groups/{group.Id}/messages",
            new SendGroupMessageRequest(4, RandomCipherB64()));
        send.EnsureSuccessStatusCode();

        var pending = await bobClient.GetFromJsonAsync<List<MessageEnvelopeDto>>(
            "/v1/messages/pending?limit=20");
        Assert.Contains(pending!, e => e.GroupId == group.Id);
    }


    [Fact]
    public async Task MultiDevice_Member_ReceivesOnAllDevices()
    {
        var (admin, adminClient) = await RegisterClientAsync();

        var username = TestData.UniqueUsername();
        var (regReq, _) = TestData.CreateRegisterRequestWithKeys(username, oneTimePreKeyCount: 5);
        var bob1 = await _client.RegisterAsync(regReq);
        var bob1Client = _factory.CreateClient();
        bob1Client.SetBearer(bob1.AccessToken);

        var tokenResponse = await bob1Client.PostAsync("/v1/devices/link-tokens", null);
        tokenResponse.EnsureSuccessStatusCode();
        var link = (await tokenResponse.Content.ReadFromJsonAsync<CreateDeviceLinkTokenResponse>())!;
        var (secondDeviceReq, _) = TestData.CreateRegisterRequestWithKeys(oneTimePreKeyCount: 5);
        var redeemResponse = await _factory.CreateClient().PostAsJsonAsync(
            "/v1/auth/device-link",
            new RedeemDeviceLinkRequest(link.Token, secondDeviceReq.Device));
        redeemResponse.EnsureSuccessStatusCode();
        var bob2 = (await redeemResponse.Content.ReadFromJsonAsync<AuthResultDto>())!;
        var bob2Client = _factory.CreateClient();
        bob2Client.SetBearer(bob2.AccessToken);

        var group = (await (await adminClient.PostAsJsonAsync(
            "/v1/groups",
            new CreateGroupRequest([bob1.UserId], null))).Content
            .ReadFromJsonAsync<GroupSummaryDto>())!;

        var sent = (await (await adminClient.PostAsJsonAsync(
            $"/v1/groups/{group.Id}/messages",
            new SendGroupMessageRequest(4, RandomCipherB64()))).Content
            .ReadFromJsonAsync<SendGroupMessageResponse>())!;
        Assert.Equal(2, sent.FanOutCount);

        var p1 = await bob1Client.GetFromJsonAsync<List<MessageEnvelopeDto>>("/v1/messages/pending?limit=20");
        var p2 = await bob2Client.GetFromJsonAsync<List<MessageEnvelopeDto>>("/v1/messages/pending?limit=20");
        Assert.Contains(p1!, e => e.GroupId == group.Id);
        Assert.Contains(p2!, e => e.GroupId == group.Id);
    }

    [Fact]
    public async Task Cap_Allows_AddUnderDefaultLimit()
    {
        var (admin, adminClient) = await RegisterClientAsync();
        var (a, _) = await RegisterClientAsync();
        var (b, _) = await RegisterClientAsync();
        var (c, _) = await RegisterClientAsync();

        // Temporarily not overriding max — just ensure create with many distinct users works under 256.
        var group = (await (await adminClient.PostAsJsonAsync(
            "/v1/groups",
            new CreateGroupRequest([a.UserId, b.UserId], null))).Content
            .ReadFromJsonAsync<GroupSummaryDto>())!;
        Assert.Equal(3, group.MemberCount);
        var add = await adminClient.PostAsJsonAsync(
            $"/v1/groups/{group.Id}/members",
            new AddGroupMembersRequest([c.UserId]));
        Assert.Equal(HttpStatusCode.NoContent, add.StatusCode);
    }
}
