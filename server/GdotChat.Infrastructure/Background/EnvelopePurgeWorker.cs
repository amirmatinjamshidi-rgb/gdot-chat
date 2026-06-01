using GdotChat.Application.Interfaces;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace GdotChat.Infrastructure.Background;

public class EnvelopePurgeWorker : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromHours(1);
    private readonly IServiceProvider _services;
    private readonly ILogger<EnvelopePurgeWorker> _logger;

    public EnvelopePurgeWorker(IServiceProvider services, ILogger<EnvelopePurgeWorker> logger)
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
                var relay = scope.ServiceProvider.GetRequiredService<IMessageRelayService>();
                var count = await relay.PurgeExpiredAsync(stoppingToken);
                if (count > 0)
                    _logger.LogInformation("Envelope purge removed {Count} rows", count);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Envelope purge failed");
            }

            await Task.Delay(Interval, stoppingToken);
        }
    }
}
