using GdotChat.Application.DTOs;
using GdotChat.Application.Interfaces;
using GdotChat.Application.Options;
using GdotChat.Application.Services;
using GdotChat.Domain.Entities;
using GdotChat.Domain.Exceptions;
using GdotChat.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace GdotChat.Tests.Integration;

public sealed class GroupServiceCapTests
{
    private sealed class NoopNotifier : IMessageNotifier
    {
        public Task NotifyEnvelopeAvailableAsync(Guid recipientDeviceId, Guid envelopeId, CancellationToken ct = default) =>
            Task.CompletedTask;
        public Task NotifyPreKeysLowAsync(Guid deviceId, int remainingCount, CancellationToken ct = default) =>
            Task.CompletedTask;
        public Task NotifySessionResetRequestedAsync(Guid targetDeviceId, Guid fromDeviceId, Guid fromUserId, CancellationToken ct = default) =>
            Task.CompletedTask;
        public Task NotifyGroupMembershipChangedAsync(Guid recipientDeviceId, GroupMembershipChangedPayload payload, CancellationToken ct = default) =>
            Task.CompletedTask;
    }

    private static AppDbContext NewDb()
    {
        var opts = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new AppDbContext(opts);
    }

    [Fact]
    public async Task CreateAsync_Throws_WhenMembersExceedCap()
    {
        await using var db = NewDb();
        var admin = new User { Id = Guid.NewGuid(), Username = "a", PasswordHash = "x", CreatedAt = DateTimeOffset.UtcNow };
        var u1 = new User { Id = Guid.NewGuid(), Username = "b", PasswordHash = "x", CreatedAt = DateTimeOffset.UtcNow };
        var u2 = new User { Id = Guid.NewGuid(), Username = "c", PasswordHash = "x", CreatedAt = DateTimeOffset.UtcNow };
        db.Users.AddRange(admin, u1, u2);
        await db.SaveChangesAsync();

        var svc = new GroupService(
            db,
            new NoopNotifier(),
            Options.Create(new RelayOptions()),
            Options.Create(new GroupOptions { MaxMembers = 2 }));

        await Assert.ThrowsAsync<GroupFullException>(() =>
            svc.CreateAsync(
                admin.Id,
                Guid.NewGuid(),
                new CreateGroupRequest([u1.Id, u2.Id], null)));
    }
}
