using GdotChat.Application.Interfaces;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace GdotChat.Infrastructure.Background;

public class AttachmentPurgeWorker : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromHours(1);
    private readonly IServiceProvider _services;
    private readonly ILogger<AttachmentPurgeWorker> _logger;

    public AttachmentPurgeWorker(IServiceProvider services, ILogger<AttachmentPurgeWorker> logger)
    {
        _services = services;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await using var scope = _services.CreateAsyncScope();
                var attachments = scope.ServiceProvider.GetRequiredService<IAttachmentService>();
                var count = await attachments.PurgeExpiredAsync(stoppingToken);
                if (count > 0)
                    _logger.LogInformation("Attachment purge removed {Count} rows", count);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Attachment purge failed");
            }

            await Task.Delay(Interval, stoppingToken);
        }
    }
}