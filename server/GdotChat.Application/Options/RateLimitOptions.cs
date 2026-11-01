namespace GdotChat.Application.Options;

public class RateLimitOptions
{
    public const string SectionName = "RateLimits";

    public int AuthRegisterPermitLimit { get; set; } = 5;
    public int AuthRegisterWindowSeconds { get; set; } = 3600;
    public int AuthLoginPermitLimit { get; set; } = 20;
    public int AuthLoginWindowSeconds { get; set; } = 3600;
    public int AuthRefreshPermitLimit { get; set; } = 30;
    public int AuthRefreshWindowSeconds { get; set; } = 60;

    public int PreKeyFetchCallerPermitLimit { get; set; } = 30;
    public int PreKeyFetchCallerWindowSeconds { get; set; } = 60;
    public int PreKeyFetchTargetPermitLimit { get; set; } = 60;
    public int PreKeyFetchTargetWindowSeconds { get; set; } = 60;

    public int MessagesSendPermitLimit { get; set; } = 60;
    public int UsersSearchPermitLimit { get; set; } = 30;
}
