using GdotChat.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GdotChat.Infrastructure.Persistence.Configurations;

public class DeviceLinkTokenConfiguration : IEntityTypeConfiguration<DeviceLinkToken>
{
    public void Configure(EntityTypeBuilder<DeviceLinkToken> builder)
    {
        builder.ToTable("device_link_tokens");
        builder.HasKey(t => t.Id);
        builder.Property(t => t.TokenHash).HasMaxLength(64).IsRequired();
        builder.HasIndex(t => t.TokenHash).IsUnique();
        builder.HasIndex(t => new { t.UserId, t.ExpiresAt });
        builder.HasOne(t => t.User).WithMany().HasForeignKey(t => t.UserId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne(t => t.CreatedByDevice).WithMany().HasForeignKey(t => t.CreatedByDeviceId).OnDelete(DeleteBehavior.Restrict);
    }
}
