using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using GdotChat.Application.DTOs;
using GdotChat.Application.Options;

namespace GdotChat.Tests.Integration;

[Collection("Integration")]
public sealed class GroupAttachmentTests
{
    private readonly GdotChatWebApplicationFactory _factory;

    public GroupAttachmentTests(GdotChatWebApplicationFactory factory) => _factory = factory;

    [Fact]
    public async Task GroupAttachment_MemberCanDownload_OutsiderForbidden_RemovedCannot()
    {
        var admin = await _factory.CreateClient().RegisterAsync();
        var bob = await _factory.CreateClient().RegisterAsync();
        var outsider = await _factory.CreateClient().RegisterAsync();

        using var adminClient = _factory.CreateClient();
        adminClient.SetBearer(admin.AccessToken);
        using var bobClient = _factory.CreateClient();
        bobClient.SetBearer(bob.AccessToken);
        using var outsiderClient = _factory.CreateClient();
        outsiderClient.SetBearer(outsider.AccessToken);

        var group = (await (await adminClient.PostAsJsonAsync(
            "/v1/groups",
            new CreateGroupRequest([bob.UserId], null))).Content
            .ReadFromJsonAsync<GroupSummaryDto>())!;

        const int plainSize = 32;
        var create = await adminClient.PostAsJsonAsync(
            "/v1/attachments",
            new CreateAttachmentRequest(admin.UserId, admin.DeviceId, plainSize, group.Id));
        create.EnsureSuccessStatusCode();
        var created = await create.Content.ReadFromJsonAsync<CreateAttachmentResponse>();
        Assert.NotNull(created);
        Assert.Equal(1, created.ChunkCount);

        var cipher = new byte[plainSize + AttachmentOptions.GcmTagBytes];
        RandomNumberGenerator.Fill(cipher);

        var upload = await adminClient.PutAsync(
            $"/v1/attachments/{created.AttachmentId}/chunks/0",
            new ByteArrayContent(cipher));
        Assert.Equal(HttpStatusCode.NoContent, upload.StatusCode);
        var complete = await adminClient.PostAsync(
            $"/v1/attachments/{created.AttachmentId}/complete", null);
        Assert.Equal(HttpStatusCode.NoContent, complete.StatusCode);

        var bobDl = await bobClient.GetAsync(
            $"/v1/attachments/{created.AttachmentId}/chunks/0");
        bobDl.EnsureSuccessStatusCode();

        var outDl = await outsiderClient.GetAsync(
            $"/v1/attachments/{created.AttachmentId}/chunks/0");
        Assert.Equal(HttpStatusCode.Forbidden, outDl.StatusCode);

        await adminClient.PostAsJsonAsync(
            $"/v1/groups/{group.Id}/members/remove",
            new RemoveGroupMemberRequest(bob.UserId));

        var bobAfter = await bobClient.GetAsync(
            $"/v1/attachments/{created.AttachmentId}/chunks/0");
        Assert.Equal(HttpStatusCode.Forbidden, bobAfter.StatusCode);

        var outsiderCreate = await outsiderClient.PostAsJsonAsync(
            "/v1/attachments",
            new CreateAttachmentRequest(outsider.UserId, outsider.DeviceId, 32, group.Id));
        Assert.Equal(HttpStatusCode.Forbidden, outsiderCreate.StatusCode);
    }
}
