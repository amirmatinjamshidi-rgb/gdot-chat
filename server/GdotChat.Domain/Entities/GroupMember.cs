namespace GdotChat.Domain.Entities;

public enum GroupMemberRole
{
    Member = 0,
    Admin = 1,
}

public class GroupMember
{
    public Guid Id { get; set; }
    public Guid GroupId { get; set; }
    public ChatGroup Group { get; set; } = null!;
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;
    public GroupMemberRole Role { get; set; }
    public DateTimeOffset JoinedAt { get; set; }
    public DateTimeOffset? LeftAt { get; set; }
}
