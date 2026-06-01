using GdotChat.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GdotChat.Infrastructure.Persistence.Configurations;

public class SignedPreKeyConfiguration : IEntityTypeConfiguration<SignedPreKey>
{
    public void Configure(EntityTypeBuilder<SignedPreKey> builder)
    {
        builder.ToTable("signed_pre_keys");
        builder.HasKey(k => k.Id);
        builder.HasIndex(k => new { k.DeviceId, k.KeyId }).IsUnique();
        builder.HasOne(k => k.Device).WithMany(d => d.SignedPreKeys).HasForeignKey(k => k.DeviceId).OnDelete(DeleteBehavior.Cascade);
    }
}
