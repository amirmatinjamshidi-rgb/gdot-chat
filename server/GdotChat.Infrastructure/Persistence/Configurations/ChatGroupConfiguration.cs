using GdotChat.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GdotChat.Infrastructure.Persistence.Configurations;

public class ChatGroupConfiguration : IEntityTypeConfiguration<ChatGroup>
{
    public void Configure(EntityTypeBuilder<ChatGroup> builder)
    {
        builder.ToTable("chat_groups");
        builder.HasKey(g => g.Id);
        builder.Property(g => g.EncryptedMetadata).HasColumnType("bytea");
        builder.HasOne(g => g.CreatedByUser)
            .WithMany()
            .HasForeignKey(g => g.CreatedByUserId)
            .OnDelete(DeleteBehavior.Restrict);
        builder.HasIndex(g => g.CreatedByUserId);
        // ListMyGroups cursor order: CreatedAt DESC, Id DESC (no LastActivityAt column).
        builder.HasIndex(g => new { g.CreatedAt, g.Id });
    }
}
