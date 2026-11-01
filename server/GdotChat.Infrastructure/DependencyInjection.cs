using GdotChat.Application.Interfaces;
using GdotChat.Application.Options;
using GdotChat.Application.Services;
using GdotChat.Infrastructure.Background;
using GdotChat.Infrastructure.Notifications;
using GdotChat.Infrastructure.Persistence;
using GdotChat.Infrastructure.Security;
using GdotChat.Infrastructure.Storage;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Minio;

namespace GdotChat.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("Default")
            ?? "Host=localhost;Database=gdotchat;Username=gdot;Password=gdot_dev";

        services.AddDbContext<AppDbContext>(options =>
            options.UseNpgsql(connectionString));

        services.AddScoped<DbContext>(sp => sp.GetRequiredService<AppDbContext>());

        services.AddScoped<IAuthService, AuthService>();
        services.AddScoped<IUserService, UserService>();
        services.AddScoped<IDeviceService, DeviceService>();
        services.AddScoped<IMessageRelayService, MessageRelayService>();
        services.AddScoped<IAttachmentService, AttachmentService>();
        services.AddScoped<IJwtTokenService, JwtTokenService>();
        services.AddScoped<IPasswordHasher, PasswordHasher>();
        services.AddScoped<IMessageNotifier, SignalRMessageNotifier>();

        services.AddHostedService<EnvelopePurgeWorker>();
        services.AddHostedService<AttachmentPurgeWorker>();

        RegisterAttachmentStorage(services, configuration);

        return services;
    }

    private static void RegisterAttachmentStorage(
        IServiceCollection services,
        IConfiguration configuration)
    {
        var minio = configuration.GetSection(MinioOptions.SectionName).Get<MinioOptions>()
            ?? new MinioOptions();
        var env = configuration["ASPNETCORE_ENVIRONMENT"] ?? "";
        if (string.Equals(env, "Testing", StringComparison.OrdinalIgnoreCase))
        {
            services.AddSingleton<IAttachmentStorage, InMemoryAttachmentStorage>();
            return;
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