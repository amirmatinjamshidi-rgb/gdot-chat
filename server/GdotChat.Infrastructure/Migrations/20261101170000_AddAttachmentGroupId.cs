using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GdotChat.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddAttachmentGroupId : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "GroupId",
                table: "attachments",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_attachments_GroupId",
                table: "attachments",
                column: "GroupId");

            migrationBuilder.AddForeignKey(
                name: "FK_attachments_chat_groups_GroupId",
                table: "attachments",
                column: "GroupId",
                principalTable: "chat_groups",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_attachments_chat_groups_GroupId",
                table: "attachments");

            migrationBuilder.DropIndex(
                name: "IX_attachments_GroupId",
                table: "attachments");

            migrationBuilder.DropColumn(
                name: "GroupId",
                table: "attachments");
        }
    }
}
