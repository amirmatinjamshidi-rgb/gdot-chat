namespace GdotChat.Application.Options;

public class RelayOptions
{
    public const string SectionName = "Relay";

    public int EnvelopeTtlDays { get; set; } = 7;
    public int PreKeyLowThreshold { get; set; } = 10;
}
