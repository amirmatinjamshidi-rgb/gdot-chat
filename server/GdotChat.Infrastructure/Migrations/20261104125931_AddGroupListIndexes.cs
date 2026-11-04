using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GdotChat.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddGroupListIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_group_members_UserId_LeftAt",
                table: "group_members");

            migrationBuilder.CreateIndex(
                name: "IX_group_members_UserId_LeftAt_GroupId",
                table: "group_members",
                columns: new[] { "UserId", "LeftAt", "GroupId" });

            migrationBuilder.CreateIndex(
                name: "IX_chat_groups_CreatedAt_Id",
                table: "chat_groups",
                columns: new[] { "CreatedAt", "Id" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_group_members_UserId_LeftAt_GroupId",
                table: "group_members");

            migrationBuilder.DropIndex(
                name: "IX_chat_groups_CreatedAt_Id",
                table: "chat_groups");

            migrationBuilder.CreateIndex(
                name: "IX_group_members_UserId_LeftAt",
                table: "group_members",
                columns: new[] { "UserId", "LeftAt" });
        }
    }
}
