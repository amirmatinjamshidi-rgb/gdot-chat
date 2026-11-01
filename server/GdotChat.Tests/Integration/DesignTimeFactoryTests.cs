using GdotChat.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace GdotChat.Tests.Integration;

/// <summary>
/// Ensures design-time DbContext factory works without host secrets (dotnet ef).
/// </summary>
public sealed class DesignTimeFactoryTests
{
    [Fact]
    public void CreateDbContext_WithNoEnv_ReturnsUsableOptions()
    {
        var previous = Environment.GetEnvironmentVariable("ConnectionStrings__Default");
        try
        {
            Environment.SetEnvironmentVariable("ConnectionStrings__Default", null);
            var factory = new AppDbContextFactory();
            using var ctx = factory.CreateDbContext([]);
            Assert.NotNull(ctx);
            Assert.True(ctx.Database.IsNpgsql());
            // Model includes device_link_tokens; reactions entity is absent (E2EE-only).
            Assert.Contains(ctx.Model.GetEntityTypes(), e => e.ClrType.Name == "DeviceLinkToken");
            Assert.DoesNotContain(ctx.Model.GetEntityTypes(), e => e.ClrType.Name.Contains("Reaction"));
        }
        finally
        {
            Environment.SetEnvironmentVariable("ConnectionStrings__Default", previous);
        }
    }

    [Fact]
    public void CreateDbContext_PrefersConnectionStringsEnvWhenSet()
    {
        var previous = Environment.GetEnvironmentVariable("ConnectionStrings__Default");
        var markerDb = "gdot_factory_test_" + Guid.NewGuid().ToString("N");
        try
        {
            Environment.SetEnvironmentVariable(
                "ConnectionStrings__Default",
                $"Host=127.0.0.1;Port=55432;Database={markerDb};Username=gdot;Password=not-used-at-design");
            var factory = new AppDbContextFactory();
            using var ctx = factory.CreateDbContext([]);
            var cs = ctx.Database.GetConnectionString() ?? "";
            Assert.Contains(markerDb, cs, StringComparison.Ordinal);
        }
        finally
        {
            Environment.SetEnvironmentVariable("ConnectionStrings__Default", previous);
        }
    }
}
