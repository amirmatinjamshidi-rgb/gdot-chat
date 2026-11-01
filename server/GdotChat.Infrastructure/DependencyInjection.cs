using GdotChat.Application.Interfaces;
using GdotChat.Application.Options;
using GdotChat.Application.Security;
using GdotChat.Application.Services;
using GdotChat.Infrastructure.Background;
using GdotChat.Infrastructure.Notifications;
using GdotChat.Infrastructure.Persistence;
using GdotChat.Infrastructure.Security;
using GdotChat.Infrastructure.Storage;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Minio;

namespace GdotChat.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration,
        IHostEnvironment environment)
    {
        var isTesting = environment.IsEnvironment("Testing");

        var connectionString = configuration.GetConnectionString("Default");
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            throw new InvalidOperationException(
                "ConnectionStrings:Default is missing. Set env ConnectionStrings__Default "
                + "(include Password=...) or user-secrets. See server/README.md.");
        }

        if (!isTesting && !ConnectionStringHasPassword(connectionString))
        {
            throw new InvalidOperationException(
                "ConnectionStrings:Default must include a non-empty Password. "
                + "Provide the full connection string via env ConnectionStrings__Default "
                + "or user-secrets — do not commit DB passwords. See server/README.md.");
        }

        services.AddDbContext<AppDbContext>(options =>
            options.UseNpgsql(connectionString));

        services.AddScoped<DbContext>(sp => sp.GetRequiredService<AppDbContext>());

        services.AddScoped<IAuthService, AuthService>();
        services.AddScoped<IUserService, UserService>();
        services.AddScoped<IDeviceService, DeviceService>();
        services.AddScoped<IMessageRelayService, MessageRelayService>();
        services.AddScoped<IGroupService, GroupService>();
        services.AddScoped<ISessionResetService, SessionResetService>();
        services.AddScoped<IAttachmentService, AttachmentService>();
        services.AddScoped<IJwtTokenService, JwtTokenService>();
        services.AddSingleton<IRefreshSuccessorProtector, RefreshSuccessorProtector>();
        services.AddScoped<IPasswordHasher, PasswordHasher>();
        services.AddScoped<IMessageNotifier, SignalRMessageNotifier>();
        services.AddSingleton<IPreKeyBundleRateLimiter, PreKeyBundleRateLimiter>();
        services.AddSingleton<IDeviceLinkRateLimiter, DeviceLinkRateLimiter>();
        services.AddSingleton<ISessionResetRateLimiter, SessionResetRateLimiter>();

        services.AddHostedService<EnvelopePurgeWorker>();
        services.AddHostedService<AttachmentPurgeWorker>();

        RegisterAttachmentStorage(services, configuration, isTesting);

        return services;
    }

    private static bool ConnectionStringHasPassword(string connectionString)
    {
        foreach (var part in connectionString.Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            var idx = part.IndexOf('=');
            if (idx <= 0) continue;
            var key = part[..idx].Trim();
            var value = part[(idx + 1)..].Trim();
            if (key.Equals("Password", StringComparison.OrdinalIgnoreCase)
                || key.Equals("Pwd", StringComparison.OrdinalIgnoreCase))
            {
                return value.Length > 0;
            }
        }

        return false;
    }

    private static void RegisterAttachmentStorage(
        IServiceCollection services,
        IConfiguration configuration,
        bool isTesting)
    {
        var minio = configuration.GetSection(MinioOptions.SectionName).Get<MinioOptions>()
            ?? new MinioOptions();

        if (isTesting)
        {
            services.AddSingleton<IAttachmentStorage, InMemoryAttachmentStorage>();
            return;
        }

        if (string.IsNullOrWhiteSpace(minio.AccessKey) || string.IsNullOrWhiteSpace(minio.SecretKey))
        {
            throw new InvalidOperationException(
                "Minio:AccessKey and Minio:SecretKey are required. Set env Minio__AccessKey / "
                + "Minio__SecretKey (or user-secrets). See server/README.md.");
        }

        services.AddSingleton<IMinioClient>(_ =>
            new MinioClient()
                .WithEndpoint(minio.Endpoint)
                .WithCredentials(minio.AccessKey, minio.SecretKey)
                .WithSSL(minio.UseSsl)
                .WithRegion(minio.Region)
                .Build());
        services.AddSingleton<IAttachmentStorage, MinioAttachmentStorage>();
    }
}
