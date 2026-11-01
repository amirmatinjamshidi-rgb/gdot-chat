using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GdotChat.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddChatGroups : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "GroupId",
                table: "message_envelopes",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "chat_groups",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    EncryptedMetadata = table.Column<byte[]>(type: "bytea", nullable: true),
                    CreatedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_chat_groups", x => x.Id);
                    table.ForeignKey(
                        name: "FK_chat_groups_users_CreatedByUserId",
                        column: x => x.CreatedByUserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "group_members",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    GroupId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Role = table.Column<int>(type: "integer", nullable: false),
                    JoinedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    LeftAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_group_members", x => x.Id);
                    table.ForeignKey(
                        name: "FK_group_members_chat_groups_GroupId",
                        column: x => x.GroupId,
                        principalTable: "chat_groups",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_group_members_users_UserId",
                        column: x => x.UserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_message_envelopes_GroupId",
                table: "message_envelopes",
                column: "GroupId");

            migrationBuilder.CreateIndex(
                name: "IX_chat_groups_CreatedByUserId",
                table: "chat_groups",
                column: "CreatedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_group_members_GroupId_LeftAt",
                table: "group_members",
                columns: new[] { "GroupId", "LeftAt" });

            migrationBuilder.CreateIndex(
                name: "IX_group_members_GroupId_UserId",
                table: "group_members",
                columns: new[] { "GroupId", "UserId" });

            migrationBuilder.CreateIndex(
                name: "IX_group_members_UserId_LeftAt",
                table: "group_members",
                columns: new[] { "UserId", "LeftAt" });

            migrationBuilder.AddForeignKey(
                name: "FK_message_envelopes_chat_groups_GroupId",
                table: "message_envelopes",
                column: "GroupId",
                principalTable: "chat_groups",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_message_envelopes_chat_groups_GroupId",
                table: "message_envelopes");

            migrationBuilder.DropTable(
                name: "group_members");

            migrationBuilder.DropTable(
                name: "chat_groups");

            migrationBuilder.DropIndex(
                name: "IX_message_envelopes_GroupId",
                table: "message_envelopes");

            migrationBuilder.DropColumn(
                name: "GroupId",
                table: "message_envelopes");
        }
    }
}
