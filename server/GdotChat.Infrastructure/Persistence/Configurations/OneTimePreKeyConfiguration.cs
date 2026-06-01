using GdotChat.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GdotChat.Infrastructure.Persistence.Configurations;

public class OneTimePreKeyConfiguration : IEntityTypeConfiguration<OneTimePreKey>
{
    public void Configure(EntityTypeBuilder<OneTimePreKey> builder)
    {
        builder.ToTable("one_time_pre_keys");
        builder.HasKey(k => k.Id);
        builder.HasIndex(k => new { k.DeviceId, k.KeyId }).IsUnique();
        builder.HasIndex(k => k.DeviceId).HasFilter("\"IsConsumed\" = false");
        builder.HasOne(k => k.Device).WithMany(d => d.OneTimePreKeys).HasForeignKey(k => k.DeviceId).OnDelete(DeleteBehavior.Cascade);
    }
}
