using GdotChat.Infrastructure.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Testcontainers.PostgreSql;

namespace GdotChat.Tests.Integration;

public sealed class GdotChatWebApplicationFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder("postgres:15")
        .WithDatabase("gdotchat_test")
        .WithUsername("gdot")
        .WithPassword("gdot_test")
        .Build();

    private string? _connectionString;

    public async Task InitializeAsync()
    {
        var external = Environment.GetEnvironmentVariable("GDOT_INTEGRATION_PG");
        if (!string.IsNullOrWhiteSpace(external))
        {
            _connectionString = external;
            return;
        }

        await _postgres.StartAsync();
        _connectionString = _postgres.GetConnectionString();
    }

    public new async Task DisposeAsync()
    {
        await _postgres.DisposeAsync();
        await base.DisposeAsync();
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.UseSetting("Jwt:SigningKey", "testing-signing-key-min-32-characters-long!!");

        var cs = _connectionString
            ?? Environment.GetEnvironmentVariable("GDOT_INTEGRATION_PG")
            ?? "Host=127.0.0.1;Port=5432;Database=gdotchat_test;Username=gdot;Password=gdot_test";
        builder.UseSetting("ConnectionStrings:Default", cs);

        // Unlimited ASP.NET rate limits for general integration tests.
        // Rate-limit suites use RateLimitedWebApplicationFactory instead.
        ApplyUnlimitedAspNetRateLimits(builder);

        // Also raise pre-key fetch limiter (custom service) for general tests.
        builder.UseSetting("RateLimits:PreKeyFetchCallerPermitLimit", int.MaxValue.ToString());
        builder.UseSetting("RateLimits:PreKeyFetchTargetPermitLimit", int.MaxValue.ToString());
        builder.UseSetting("RateLimits:PreKeyFetchCallerWindowSeconds", "3600");
        builder.UseSetting("RateLimits:PreKeyFetchTargetWindowSeconds", "3600");
        builder.UseSetting("RateLimits:SessionResetPermitLimit", int.MaxValue.ToString());
        builder.UseSetting("RateLimits:SessionResetWindowSeconds", "3600");

        builder.ConfigureTestServices(services =>
        {
            var descriptors = services
                .Where(d =>
                    d.ServiceType == typeof(DbContextOptions<AppDbContext>)
                    || d.ServiceType == typeof(DbContext)
                    || d.ServiceType == typeof(AppDbContext))
                .ToList();

            foreach (var descriptor in descriptors)
                services.Remove(descriptor);

            services.AddDbContext<AppDbContext>(options =>
                options.UseNpgsql(cs));
            services.AddScoped<DbContext>(sp => sp.GetRequiredService<AppDbContext>());
        });
    }

    internal static void ApplyUnlimitedAspNetRateLimits(IWebHostBuilder builder)
    {
        builder.UseSetting("RateLimits:AuthRegisterPermitLimit", int.MaxValue.ToString());
        builder.UseSetting("RateLimits:AuthLoginPermitLimit", int.MaxValue.ToString());
        builder.UseSetting("RateLimits:AuthRefreshPermitLimit", int.MaxValue.ToString());
        builder.UseSetting("RateLimits:MessagesSendPermitLimit", int.MaxValue.ToString());
        builder.UseSetting("RateLimits:UsersSearchPermitLimit", int.MaxValue.ToString());
        builder.UseSetting("Attachments:CreatePermitLimit", int.MaxValue.ToString());
        builder.UseSetting("Attachments:ChunkPermitLimit", int.MaxValue.ToString());
    }
}
