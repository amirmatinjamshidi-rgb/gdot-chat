using GdotChat.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GdotChat.Infrastructure.Persistence.Configurations;

public class GroupMemberConfiguration : IEntityTypeConfiguration<GroupMember>
{
    public void Configure(EntityTypeBuilder<GroupMember> builder)
    {
        builder.ToTable("group_members");
        builder.HasKey(m => m.Id);
        builder.Property(m => m.Role).HasConversion<int>();
        builder.HasOne(m => m.Group)
            .WithMany(g => g.Members)
            .HasForeignKey(m => m.GroupId)
            .OnDelete(DeleteBehavior.Cascade);
        builder.HasOne(m => m.User)
            .WithMany()
            .HasForeignKey(m => m.UserId)
            .OnDelete(DeleteBehavior.Restrict);
        // One active membership row per (group, user); left members keep LeftAt set.
        builder.HasIndex(m => new { m.GroupId, m.UserId });
        builder.HasIndex(m => new { m.UserId, m.LeftAt });
        builder.HasIndex(m => new { m.GroupId, m.LeftAt });
    }
}
