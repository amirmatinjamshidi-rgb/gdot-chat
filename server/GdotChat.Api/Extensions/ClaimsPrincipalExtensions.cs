using System.Security.Claims;

namespace GdotChat.Api.Extensions;

public static class ClaimsPrincipalExtensions
{
    public static Guid GetUserId(this ClaimsPrincipal user)
    {
        var sub = user.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? user.FindFirstValue("sub")
            ?? throw new UnauthorizedAccessException();
        return Guid.Parse(sub);
    }

    public static Guid GetDeviceId(this ClaimsPrincipal user)
    {
        var deviceId = user.FindFirstValue("device_id")
            ?? throw new UnauthorizedAccessException();
        return Guid.Parse(deviceId);
    }
}
