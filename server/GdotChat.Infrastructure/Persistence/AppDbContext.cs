using GdotChat.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace GdotChat.Infrastructure.Persistence;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<User> Users => Set<User>();
    public DbSet<Device> Devices => Set<Device>();
    public DbSet<SignedPreKey> SignedPreKeys => Set<SignedPreKey>();
    public DbSet<OneTimePreKey> OneTimePreKeys => Set<OneTimePreKey>();
    public DbSet<MessageEnvelope> MessageEnvelopes => Set<MessageEnvelope>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<Attachment> Attachments => Set<Attachment>();
    public DbSet<DeviceLinkToken> DeviceLinkTokens => Set<DeviceLinkToken>();
    public DbSet<ChatGroup> ChatGroups => Set<ChatGroup>();
    public DbSet<GroupMember> GroupMembers => Set<GroupMember>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(AppDbContext).Assembly);
        base.OnModelCreating(modelBuilder);
    }
}
