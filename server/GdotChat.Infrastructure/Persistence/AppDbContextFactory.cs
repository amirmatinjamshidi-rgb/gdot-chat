using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace GdotChat.Infrastructure.Persistence;

/// <summary>
/// Design-time only. Lets <c>dotnet ef migrations</c> build a DbContext without
/// starting the API host (so Minio / Jwt secrets are not required for scaffolding).
/// Prefer <c>ConnectionStrings__Default</c> when set (e.g. <c>database update</c>);
/// otherwise use a local placeholder — <c>migrations add</c> never opens a connection.
/// Runtime still goes through <see cref="DependencyInjection"/> secret checks.
/// </summary>
public sealed class AppDbContextFactory : IDesignTimeDbContextFactory<AppDbContext>
{
    private const string DesignTimePlaceholder =
        "Host=127.0.0.1;Port=5433;Database=gdot_design_time;Username=gdot;Password=design-time-only";

    public AppDbContext CreateDbContext(string[] args)
    {
        var connectionString = Environment.GetEnvironmentVariable("ConnectionStrings__Default");
        if (string.IsNullOrWhiteSpace(connectionString))
            connectionString = DesignTimePlaceholder;

        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql(connectionString)
            .Options;
        return new AppDbContext(options);
    }
}
