namespace GdotChat.Application.Options;

public class GroupOptions
{
    public const string SectionName = "Groups";

    /// <summary>Max current (non-left) members including creator.</summary>
    public int MaxMembers { get; set; } = 256;

    /// <summary>Sender-key group ciphertext message type (Signal SenderKeyMessage).</summary>
    public int SenderKeyMessageType { get; set; } = 4;
}
