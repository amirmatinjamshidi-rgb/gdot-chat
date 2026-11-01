using GdotChat.Infrastructure.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Testcontainers.PostgreSql;

namespace GdotChat.Tests.Integration;

/// <summary>
/// Separate host with low, configurable rate limits for dedicated rate-limit tests.
/// </summary>
public sealed class RateLimitedWebApplicationFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder("postgres:15")
        .WithDatabase("gdotchat_ratelimit_test")
        .WithUsername("gdot")
        .WithPassword("gdot_test")
        .Build();

    private string? _connectionString;

    /// <summary>Caller may change before first CreateClient; defaults are intentionally tiny.</summary>
    public int AuthRefreshPermitLimit { get; set; } = 3;
    public int AuthRefreshWindowSeconds { get; set; } = 3600;
    public int PreKeyFetchCallerPermitLimit { get; set; } = 2;
    public int PreKeyFetchTargetPermitLimit { get; set; } = 3;
    public int PreKeyFetchWindowSeconds { get; set; } = 3600;

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
            ?? "Host=127.0.0.1;Port=5432;Database=gdotchat_ratelimit_test;Username=gdot;Password=gdot_test";
        builder.UseSetting("ConnectionStrings:Default", cs);

        // Keep other ASP.NET limits high; only tighten the ones under test.
        GdotChatWebApplicationFactory.ApplyUnlimitedAspNetRateLimits(builder);
        builder.UseSetting("RateLimits:AuthRefreshPermitLimit", AuthRefreshPermitLimit.ToString());
        builder.UseSetting("RateLimits:AuthRefreshWindowSeconds", AuthRefreshWindowSeconds.ToString());

        builder.UseSetting("RateLimits:PreKeyFetchCallerPermitLimit", PreKeyFetchCallerPermitLimit.ToString());
        builder.UseSetting("RateLimits:PreKeyFetchTargetPermitLimit", PreKeyFetchTargetPermitLimit.ToString());
        builder.UseSetting("RateLimits:PreKeyFetchCallerWindowSeconds", PreKeyFetchWindowSeconds.ToString());
        builder.UseSetting("RateLimits:PreKeyFetchTargetWindowSeconds", PreKeyFetchWindowSeconds.ToString());

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
}

[CollectionDefinition("RateLimit")]
public sealed class RateLimitCollection : ICollectionFixture<RateLimitedWebApplicationFactory>;
