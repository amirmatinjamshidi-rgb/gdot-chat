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
    public DbSet<MessageReaction> MessageReactions => Set<MessageReaction>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(AppDbContext).Assembly);
        base.OnModelCreating(modelBuilder);
    }
}
