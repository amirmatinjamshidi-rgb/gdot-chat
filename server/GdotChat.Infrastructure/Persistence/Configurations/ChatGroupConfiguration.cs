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
        builder.Property(g => g.LastActivityAt).IsRequired();
        builder.HasOne(g => g.CreatedByUser)
            .WithMany()
            .HasForeignKey(g => g.CreatedByUserId)
            .OnDelete(DeleteBehavior.Restrict);
        builder.HasIndex(g => g.CreatedByUserId);
        // ListMyGroups cursor order: LastActivityAt DESC, Id DESC
        builder.HasIndex(g => new { g.LastActivityAt, g.Id });
    }
}
