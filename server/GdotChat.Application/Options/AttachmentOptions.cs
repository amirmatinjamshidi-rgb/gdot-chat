namespace GdotChat.Application.Options;

public class AttachmentOptions
{
    public const string SectionName = "Attachments";
    public const int GcmTagBytes = 16;

    public long MaxSizeBytes { get; set; } = 1024L * 1024L * 1024L;
    public int ChunkSizeBytes { get; set; } = 4 * 1024 * 1024;
    public int TtlDays { get; set; } = 7;
    public int MaxActivePerDevice { get; set; } = 20;
    public int CreatePermitLimit { get; set; } = 20;
    public int ChunkPermitLimit { get; set; } = 180;
}