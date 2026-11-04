using System.Data.Common;
using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using GdotChat.Application.DTOs;
using GdotChat.Application.Interfaces;
using GdotChat.Application.Options;
using GdotChat.Application.Services;
using GdotChat.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace GdotChat.Tests.Integration;

[Collection("Integration")]
public sealed class GroupListPaginationTests
{
    private readonly HttpClient _client;
    private readonly GdotChatWebApplicationFactory _factory;

    public GroupListPaginationTests(GdotChatWebApplicationFactory factory)
    {
        _factory = factory;
        _client = factory.CreateClient();
    }

    private async Task<(AuthResultDto Auth, HttpClient Client)> RegisterClientAsync()
    {
        var auth = await _client.RegisterAsync();
        var c = _factory.CreateClient();
        c.SetBearer(auth.AccessToken);
        return (auth, c);
    }

    [Fact]
    public void GroupListCursor_RoundTrips_AndRejectsGarbage()
    {
        var at = DateTimeOffset.Parse("2026-11-04T12:00:00Z");
        var id = Guid.Parse("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
        var enc = GroupListCursor.Encode(at, id);
        Assert.True(GroupListCursor.TryDecode(enc, out var at2, out var id2));
        Assert.Equal(at.UtcTicks, at2.UtcTicks);
        Assert.Equal(id, id2);
        Assert.False(GroupListCursor.TryDecode("%%%not-base64%%%", out _, out _));
        Assert.False(GroupListCursor.TryDecode("YWJj", out _, out _));
    }

    [Fact]
    public async Task ListMyGroups_Pages_ByCreatedAtCursor_WithoutOverlap()
    {
        var (_, adminClient) = await RegisterClientAsync();
        var created = new List<Guid>();
        for (var i = 0; i < 7; i++)
        {
            var res = await adminClient.PostAsJsonAsync(
                "/v1/groups",
                new CreateGroupRequest([], Convert.ToBase64String(RandomNumberGenerator.GetBytes(8))));
            res.EnsureSuccessStatusCode();
            var g = (await res.Content.ReadFromJsonAsync<GroupSummaryDto>())!;
            created.Add(g.Id);
            await Task.Delay(5);
        }

        var page1 = await adminClient.GetFromJsonAsync<GroupListPageDto>("/v1/groups?limit=3");
        Assert.NotNull(page1);
        Assert.Equal(3, page1!.Items.Count);
        Assert.False(string.IsNullOrEmpty(page1.NextCursor));

        var page2 = await adminClient.GetFromJsonAsync<GroupListPageDto>(
            $"/v1/groups?limit=3&after={Uri.EscapeDataString(page1.NextCursor!)}");
        Assert.NotNull(page2);
        Assert.Equal(3, page2!.Items.Count);
        Assert.False(string.IsNullOrEmpty(page2.NextCursor));

        var page3 = await adminClient.GetFromJsonAsync<GroupListPageDto>(
            $"/v1/groups?limit=3&after={Uri.EscapeDataString(page2.NextCursor!)}");
        Assert.NotNull(page3);
        Assert.True(page3!.Items.Count >= 1);
        Assert.Null(page3.NextCursor);

        var allIds = page1.Items.Concat(page2.Items).Concat(page3.Items).Select(g => g.Id).ToList();
        Assert.Equal(allIds.Count, allIds.Distinct().Count());
        foreach (var id in created)
            Assert.Contains(id, allIds);

        var page2b = await adminClient.GetFromJsonAsync<GroupListPageDto>(
            $"/v1/groups?limit=3&after={Uri.EscapeDataString(page1.NextCursor!)}");
        Assert.Equal(page2.Items[0].Id, page2b!.Items[0].Id);

        for (var i = 1; i < page1.Items.Count; i++)
            Assert.True(page1.Items[i - 1].CreatedAt >= page1.Items[i].CreatedAt);
    }

    [Fact]
    public async Task ListMyGroups_InvalidCursor_Returns400()
    {
        var (_, client) = await RegisterClientAsync();
        var res = await client.GetAsync("/v1/groups?after=not-a-cursor");
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task ListMyGroups_UsesSingleSqlRoundTrip_PerPage()
    {
        var (auth, userClient) = await RegisterClientAsync();
        for (var i = 0; i < 5; i++)
            (await userClient.PostAsJsonAsync("/v1/groups", new CreateGroupRequest([], null)))
                .EnsureSuccessStatusCode();

        await using var scope = _factory.Services.CreateAsyncScope();
        var existing = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var cs = existing.Database.GetConnectionString()
            ?? existing.Database.GetDbConnection().ConnectionString
            ?? throw new InvalidOperationException("missing connection string");

        var interceptor = new CountingInterceptor();
        var builder = new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql(cs)
            .AddInterceptors(interceptor);
        await using var db = new AppDbContext(builder.Options);

        var svc = new GroupService(
            db,
            new NoopNotifier(),
            new NoopQueue(),
            Options.Create(new RelayOptions()),
            Options.Create(new GroupOptions()),
            NullLogger<GroupService>.Instance);

        interceptor.Reset();
        var page = await svc.ListMyGroupsAsync(auth.UserId, limit: 2);
        Assert.True(page.Items.Count > 0);
        // One SELECT for the page (member-count is a correlated subquery in the same command).
        Assert.Equal(1, interceptor.ReaderCount);
    }

    private sealed class CountingInterceptor : DbCommandInterceptor
    {
        public int ReaderCount;

        public void Reset() => ReaderCount = 0;

        public override InterceptionResult<DbDataReader> ReaderExecuting(
            DbCommand command,
            CommandEventData eventData,
            InterceptionResult<DbDataReader> result)
        {
            Interlocked.Increment(ref ReaderCount);
            return base.ReaderExecuting(command, eventData, result);
        }

        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(
            DbCommand command,
            CommandEventData eventData,
            InterceptionResult<DbDataReader> result,
            CancellationToken cancellationToken = default)
        {
            Interlocked.Increment(ref ReaderCount);
            return base.ReaderExecutingAsync(command, eventData, result, cancellationToken);
        }
    }

    private sealed class NoopNotifier : IMessageNotifier
    {
        public Task NotifyEnvelopeAvailableAsync(Guid recipientDeviceId, Guid envelopeId, CancellationToken ct = default) => Task.CompletedTask;
        public Task NotifyPreKeysLowAsync(Guid deviceId, int remainingCount, CancellationToken ct = default) => Task.CompletedTask;
        public Task NotifySessionResetRequestedAsync(Guid targetDeviceId, Guid fromDeviceId, Guid fromUserId, CancellationToken ct = default) => Task.CompletedTask;
        public Task NotifyGroupMembershipChangedAsync(Guid recipientDeviceId, GroupMembershipChangedPayload payload, CancellationToken ct = default) => Task.CompletedTask;
        public Task NotifyEnvelopeAvailableManyAsync(IReadOnlyList<Guid> recipientDeviceIds, Guid envelopeIdForPayload, CancellationToken ct = default) => Task.CompletedTask;
        public Task NotifyGroupMembershipChangedManyAsync(IReadOnlyList<Guid> recipientDeviceIds, GroupMembershipChangedPayload payload, CancellationToken ct = default) => Task.CompletedTask;
    }

    private sealed class NoopQueue : IEnvelopeNotifyQueue
    {
        public int QueuedCount => 0;
        public int Capacity => 100;
        public bool TryEnqueue(EnvelopeNotifyItem item) => true;
        public bool TryEnqueueMany(IReadOnlyList<EnvelopeNotifyItem> items) => true;
    }
}
