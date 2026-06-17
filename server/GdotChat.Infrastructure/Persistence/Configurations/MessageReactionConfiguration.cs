using GdotChat.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GdotChat.Infrastructure.Persistence.Configurations;

public class MessageReactionConfiguration : IEntityTypeConfiguration<MessageReaction>
{
    public void Configure(EntityTypeBuilder<MessageReaction> builder)
    {
        builder.ToTable("message_reactions");
        builder.HasKey(r => r.Id);
        builder.Property(r => r.MessageClientId).HasMaxLength(64).IsRequired();
        builder.Property(r => r.ConversationId).HasMaxLength(64).IsRequired();
        builder.Property(r => r.ServerEnvelopeId).HasMaxLength(64);
        builder.Property(r => r.Emoji).HasMaxLength(32).IsRequired();
        builder.HasIndex(r => new { r.MessageClientId, r.Emoji, r.UserId }).IsUnique();
        builder.HasOne(r => r.User).WithMany().HasForeignKey(r => r.UserId);
        builder.HasOne(r => r.RecipientDevice).WithMany().HasForeignKey(r => r.RecipientDeviceId);
    }
}
