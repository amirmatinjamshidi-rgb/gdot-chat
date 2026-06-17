using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GdotChat.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddMessageReactions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "message_reactions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    MessageClientId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    ConversationId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    ServerEnvelopeId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    RecipientDeviceId = table.Column<Guid>(type: "uuid", nullable: false),
                    Emoji = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_message_reactions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_message_reactions_devices_RecipientDeviceId",
                        column: x => x.RecipientDeviceId,
                        principalTable: "devices",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_message_reactions_users_UserId",
                        column: x => x.UserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_message_reactions_MessageClientId_Emoji_UserId",
                table: "message_reactions",
                columns: new[] { "MessageClientId", "Emoji", "UserId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_message_reactions_RecipientDeviceId",
                table: "message_reactions",
                column: "RecipientDeviceId");

            migrationBuilder.CreateIndex(
                name: "IX_message_reactions_UserId",
                table: "message_reactions",
                column: "UserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "message_reactions");
        }
    }
}
