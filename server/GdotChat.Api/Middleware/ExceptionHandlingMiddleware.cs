using GdotChat.Domain.Exceptions;

namespace GdotChat.Api.Middleware;

public class ExceptionHandlingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ExceptionHandlingMiddleware> _logger;

    public ExceptionHandlingMiddleware(RequestDelegate next, ILogger<ExceptionHandlingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (Exception ex)
        {
            var (status, message) = MapException(ex);
            if (status >= 500)
                _logger.LogError(ex, "Unhandled error");
            else
                _logger.LogWarning("Request failed: {Message}", message);

            context.Response.StatusCode = status;
            context.Response.ContentType = "application/json";
            await context.Response.WriteAsJsonAsync(new { error = message });
        }
    }

    private static (int Status, string Message) MapException(Exception ex) => ex switch
    {
        UsernameTakenException => (409, ex.Message),
        PreKeysExhaustedException => (428, ex.Message),
        ForbiddenDeviceException => (403, ex.Message),
        DeviceNotFoundException => (404, ex.Message),
        UserNotFoundException => (404, ex.Message),
        EnvelopeNotFoundException => (404, ex.Message),
        InvalidCredentialsException => (401, ex.Message),
        UnauthorizedAccessException => (401, ex.Message),
        _ => (500, "An unexpected error occurred"),
    };
}
