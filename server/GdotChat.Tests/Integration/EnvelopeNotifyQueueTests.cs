using System.Diagnostics;
using GdotChat.Application.DTOs;
using GdotChat.Application.Interfaces;
using GdotChat.Application.Options;
using GdotChat.Application.Services;
using GdotChat.Domain.Entities;
using GdotChat.Infrastructure.Background;
using GdotChat.Infrastructure.Notifications;
using GdotChat.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace GdotChat.Tests.Integration;

public sealed class EnvelopeNotifyQueueTests
{
    [Fact]
    public void TryEnqueue_ReturnsFalse_WhenCapacityExceeded()
    {
        var q = new ChannelEnvelopeNotifyQueue(NullLogger<ChannelEnvelopeNotifyQueue>.Instance, capacity: 2);
        Assert.True(q.TryEnqueue(new EnvelopeNotifyItem(Guid.NewGuid(), Guid.NewGuid())));
        Assert.True(q.TryEnqueue(new EnvelopeNotifyItem(Guid.NewGuid(), Guid.NewGuid())));
        Assert.False(q.TryEnqueue(new EnvelopeNotifyItem(Guid.NewGuid(), Guid.NewGuid())));
        Assert.Equal(2, q.QueuedCount);
    }

    [Fact]
    public async Task Worker_Batches_IntoSingleManyNotify()
    {
        var q = new ChannelEnvelopeNotifyQueue(NullLogger<ChannelEnvelopeNotifyQueue>.Instance, capacity: 1000);
        var notifier = new RecordingNotifier();
        var metrics = new EnvelopeNotifyMetrics();
        var worker = new EnvelopeNotifyWorker(
            q,
            notifier,
            metrics,
            NullLogger<EnvelopeNotifyWorker>.Instance,
            batchSize: 100);

        using var cts = new CancellationTokenSource();
        var run = worker.StartAsync(cts.Token);

        var devices = Enumerable.Range(0, 250).Select(_ => Guid.NewGuid()).ToList();
        foreach (var d in devices)
            Assert.True(q.TryEnqueue(new EnvelopeNotifyItem(d, Guid.NewGuid())));

        var sw = Stopwatch.StartNew();
        while (notifier.ManyCalls.Count < 3 && sw.Elapsed < TimeSpan.FromSeconds(5))
            await Task.Delay(20);

        await cts.CancelAsync();
        await worker.StopAsync(CancellationToken.None);
        await run;

        Assert.Equal(3, notifier.ManyCalls.Count); // 100 + 100 + 50
        Assert.Equal(100, notifier.ManyCalls[0].Count);
        Assert.Equal(100, notifier.ManyCalls[1].Count);
        Assert.Equal(50, notifier.ManyCalls[2].Count);
        Assert.Equal(250, notifier.ManyCalls.Sum(c => c.Count));
    }

    [Fact]
    public async Task GroupSend_ReturnsBeforeNotifierRuns_AndEnqueuesAllDevices()
    {
        await using var db = NewDb();
        var admin = NewUser("admin");
        var members = Enumerable.Range(0, 8).Select(i => NewUser($"u{i}")).ToList();
        db.Users.Add(admin);
        db.Users.AddRange(members);

        var adminDevice = NewDevice(admin.Id);
        db.Devices.Add(adminDevice);
        var memberDevices = members.Select(u => NewDevice(u.Id)).ToList();
        db.Devices.AddRange(memberDevices);

        var group = new ChatGroup
        {
            Id = Guid.NewGuid(),
            CreatedByUserId = admin.Id,
            CreatedAt = DateTimeOffset.UtcNow,
        };
        db.ChatGroups.Add(group);
        db.GroupMembers.Add(new GroupMember
        {
            Id = Guid.NewGuid(),
            GroupId = group.Id,
            UserId = admin.Id,
            Role = GroupMemberRole.Admin,
            JoinedAt = DateTimeOffset.UtcNow,
        });
        foreach (var u in members)
        {
            db.GroupMembers.Add(new GroupMember
            {
                Id = Guid.NewGuid(),
                GroupId = group.Id,
                UserId = u.Id,
                Role = GroupMemberRole.Member,
                JoinedAt = DateTimeOffset.UtcNow,
            });
        }
        await db.SaveChangesAsync();

        var q = new ChannelEnvelopeNotifyQueue(NullLogger<ChannelEnvelopeNotifyQueue>.Instance, capacity: 1000);
        var slow = new SlowNotifier(TimeSpan.FromSeconds(2));
        var svc = new GroupService(
            db,
            slow,
            q,
            Options.Create(new RelayOptions { MaxCiphertextBytes = 1024, EnvelopeTtlDays = 7 }),
            Options.Create(new GroupOptions { MaxMembers = 256, SenderKeyMessageType = 4 }),
            NullLogger<GroupService>.Instance);

        var sw = Stopwatch.StartNew();
        var result = await svc.SendAsync(
            admin.Id,
            adminDevice.Id,
            group.Id,
            new SendGroupMessageRequest(4, Convert.ToBase64String(new byte[16])));
        sw.Stop();

        Assert.Equal(8, result.FanOutCount);
        Assert.True(sw.Elapsed < TimeSpan.FromMilliseconds(500),
            $"SendAsync awaited notifier; took {sw.ElapsedMilliseconds}ms");
        Assert.Equal(8, q.QueuedCount);
        Assert.Empty(slow.ManyCalls);
        Assert.Empty(slow.SingleCalls);
    }

    private static AppDbContext NewDb()
    {
        var opts = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new AppDbContext(opts);
    }

    private static User NewUser(string name) => new()
    {
        Id = Guid.NewGuid(),
        Username = name + Guid.NewGuid().ToString("N")[..6],
        PasswordHash = "x",
        CreatedAt = DateTimeOffset.UtcNow,
    };

    private static Device NewDevice(Guid userId) => new()
    {
        Id = Guid.NewGuid(),
        UserId = userId,
        Name = "test",
        RegistrationId = Random.Shared.Next(1, int.MaxValue),
        IdentityKeyPublic = new byte[32],
        IsActive = true,
        CreatedAt = DateTimeOffset.UtcNow,
        LastSeenAt = DateTimeOffset.UtcNow,
    };

    private sealed class RecordingNotifier : IMessageNotifier
    {
        public List<IReadOnlyList<Guid>> ManyCalls { get; } = new();
        public Task NotifyEnvelopeAvailableAsync(Guid recipientDeviceId, Guid envelopeId, CancellationToken ct = default) => Task.CompletedTask;
        public Task NotifyPreKeysLowAsync(Guid deviceId, int remainingCount, CancellationToken ct = default) => Task.CompletedTask;
        public Task NotifySessionResetRequestedAsync(Guid targetDeviceId, Guid fromDeviceId, Guid fromUserId, CancellationToken ct = default) => Task.CompletedTask;
        public Task NotifyGroupMembershipChangedAsync(Guid recipientDeviceId, GroupMembershipChangedPayload payload, CancellationToken ct = default) => Task.CompletedTask;
        public Task NotifyEnvelopeAvailableManyAsync(IReadOnlyList<Guid> recipientDeviceIds, Guid envelopeIdForPayload, CancellationToken ct = default)
        {
            ManyCalls.Add(recipientDeviceIds.ToList());
            return Task.CompletedTask;
        }
        public Task NotifyGroupMembershipChangedManyAsync(IReadOnlyList<Guid> recipientDeviceIds, GroupMembershipChangedPayload payload, CancellationToken ct = default) => Task.CompletedTask;
    }

    private sealed class SlowNotifier : IMessageNotifier
    {
        private readonly TimeSpan _delay;
        public List<Guid> SingleCalls { get; } = new();
        public List<IReadOnlyList<Guid>> ManyCalls { get; } = new();
        public SlowNotifier(TimeSpan delay) => _delay = delay;
        public async Task NotifyEnvelopeAvailableAsync(Guid recipientDeviceId, Guid envelopeId, CancellationToken ct = default)
        {
            SingleCalls.Add(recipientDeviceId);
            await Task.Delay(_delay, ct);
        }
        public Task NotifyPreKeysLowAsync(Guid deviceId, int remainingCount, CancellationToken ct = default) => Task.CompletedTask;
        public Task NotifySessionResetRequestedAsync(Guid targetDeviceId, Guid fromDeviceId, Guid fromUserId, CancellationToken ct = default) => Task.CompletedTask;
        public Task NotifyGroupMembershipChangedAsync(Guid recipientDeviceId, GroupMembershipChangedPayload payload, CancellationToken ct = default) => Task.CompletedTask;
        public async Task NotifyEnvelopeAvailableManyAsync(IReadOnlyList<Guid> recipientDeviceIds, Guid envelopeIdForPayload, CancellationToken ct = default)
        {
            ManyCalls.Add(recipientDeviceIds.ToList());
            await Task.Delay(_delay, ct);
        }
        public Task NotifyGroupMembershipChangedManyAsync(IReadOnlyList<Guid> recipientDeviceIds, GroupMembershipChangedPayload payload, CancellationToken ct = default) => Task.CompletedTask;
    }
}
