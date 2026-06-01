using GdotChat.Application.Interfaces;
using GdotChat.Application.Services;
using GdotChat.Infrastructure.Background;
using GdotChat.Infrastructure.Notifications;
using GdotChat.Infrastructure.Persistence;
using GdotChat.Infrastructure.Security;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

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
        services.AddScoped<IJwtTokenService, JwtTokenService>();
        services.AddScoped<IPasswordHasher, PasswordHasher>();
        services.AddScoped<IMessageNotifier, SignalRMessageNotifier>();

        services.AddHostedService<EnvelopePurgeWorker>();

        return services;
    }
}
