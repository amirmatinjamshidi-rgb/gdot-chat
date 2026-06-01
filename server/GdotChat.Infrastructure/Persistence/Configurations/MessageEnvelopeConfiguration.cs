using GdotChat.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GdotChat.Infrastructure.Persistence.Configurations;

public class MessageEnvelopeConfiguration : IEntityTypeConfiguration<MessageEnvelope>
{
    public void Configure(EntityTypeBuilder<MessageEnvelope> builder)
    {
        builder.ToTable("message_envelopes");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.MessageType).IsRequired();
        builder.Property(e => e.Ciphertext).IsRequired();
        builder.HasIndex(e => new { e.RecipientDeviceId, e.CreatedAt });
        builder.HasOne(e => e.SenderDevice).WithMany().HasForeignKey(e => e.SenderDeviceId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(e => e.RecipientDevice).WithMany().HasForeignKey(e => e.RecipientDeviceId).OnDelete(DeleteBehavior.Restrict);
    }
}
