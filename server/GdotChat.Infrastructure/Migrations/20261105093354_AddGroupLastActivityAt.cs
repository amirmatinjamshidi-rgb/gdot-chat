using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GdotChat.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddGroupLastActivityAt : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_chat_groups_CreatedAt_Id",
                table: "chat_groups");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "LastActivityAt",
                table: "chat_groups",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTimeOffset(new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)));

            // Existing groups: treat creation as last activity until the next send.
            migrationBuilder.Sql("""UPDATE chat_groups SET "LastActivityAt" = "CreatedAt";""");

            migrationBuilder.CreateIndex(
                name: "IX_chat_groups_LastActivityAt_Id",
                table: "chat_groups",
                columns: new[] { "LastActivityAt", "Id" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_chat_groups_LastActivityAt_Id",
                table: "chat_groups");

            migrationBuilder.DropColumn(
                name: "LastActivityAt",
                table: "chat_groups");

            migrationBuilder.CreateIndex(
                name: "IX_chat_groups_CreatedAt_Id",
                table: "chat_groups",
                columns: new[] { "CreatedAt", "Id" });
        }
    }
}
