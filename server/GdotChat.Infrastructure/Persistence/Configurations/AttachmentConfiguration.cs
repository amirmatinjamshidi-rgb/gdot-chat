using GdotChat.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GdotChat.Infrastructure.Persistence.Configurations;

public class AttachmentConfiguration : IEntityTypeConfiguration<Attachment>
{
    public void Configure(EntityTypeBuilder<Attachment> builder)
    {
        builder.ToTable("attachments");
        builder.HasKey(a => a.Id);
        builder.Property(a => a.PlainSizeBytes).IsRequired();
        builder.Property(a => a.ChunkSizeBytes).IsRequired();
        builder.Property(a => a.ChunkCount).IsRequired();
        builder.Property(a => a.Status).HasConversion<string>().HasMaxLength(32).IsRequired();
        builder.HasIndex(a => new { a.RecipientDeviceId, a.ExpiresAt });
        builder.HasIndex(a => new { a.SenderDeviceId, a.Status });
        builder.HasOne(a => a.SenderDevice).WithMany().HasForeignKey(a => a.SenderDeviceId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(a => a.RecipientDevice).WithMany().HasForeignKey(a => a.RecipientDeviceId).OnDelete(DeleteBehavior.Restrict);
    }
}