using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GdotChat.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class DropMessageReactions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // IF EXISTS: safe when AddMessageReactions was skipped historically or table already gone.
            migrationBuilder.Sql("DROP TABLE IF EXISTS message_reactions CASCADE;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Recreate only if missing (symmetric with Up).
            migrationBuilder.Sql("""
                CREATE TABLE IF NOT EXISTS message_reactions (
                  "Id" uuid NOT NULL,
                  "MessageClientId" character varying(64) NOT NULL,
                  "ConversationId" character varying(64) NOT NULL,
                  "ServerEnvelopeId" character varying(64) NULL,
                  "UserId" uuid NOT NULL,
                  "RecipientDeviceId" uuid NOT NULL,
                  "Emoji" character varying(32) NOT NULL,
                  "CreatedAt" timestamp with time zone NOT NULL,
                  CONSTRAINT "PK_message_reactions" PRIMARY KEY ("Id"),
                  CONSTRAINT "FK_message_reactions_devices_RecipientDeviceId"
                    FOREIGN KEY ("RecipientDeviceId") REFERENCES devices ("Id") ON DELETE CASCADE,
                  CONSTRAINT "FK_message_reactions_users_UserId"
                    FOREIGN KEY ("UserId") REFERENCES users ("Id") ON DELETE CASCADE
                );
                CREATE UNIQUE INDEX IF NOT EXISTS "IX_message_reactions_MessageClientId_Emoji_UserId"
                  ON message_reactions ("MessageClientId", "Emoji", "UserId");
                CREATE INDEX IF NOT EXISTS "IX_message_reactions_RecipientDeviceId"
                  ON message_reactions ("RecipientDeviceId");
                CREATE INDEX IF NOT EXISTS "IX_message_reactions_UserId"
                  ON message_reactions ("UserId");
                """);
        }
    }
}
