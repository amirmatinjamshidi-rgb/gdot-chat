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

    public async Task InitializeAsync()
    {
        var external = Environment.GetEnvironmentVariable("GDOT_INTEGRATION_PG");
        if (!string.IsNullOrWhiteSpace(external))
            return;

        await _postgres.StartAsync();
    }

    public new async Task DisposeAsync()
    {
        await _postgres.DisposeAsync();
        await base.DisposeAsync();
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");

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

            var connectionString = Environment.GetEnvironmentVariable("GDOT_INTEGRATION_PG")
                ?? _postgres.GetConnectionString();

            services.AddDbContext<AppDbContext>(options =>
                options.UseNpgsql(connectionString));
            services.AddScoped<DbContext>(sp => sp.GetRequiredService<AppDbContext>());
        });
    }
}
