using GdotChat.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace GdotChat.Tests.Integration;

/// <summary>
/// E2E: migration assembly discovers the full reaction add/drop chain with stable ids.
/// </summary>
public sealed class DesignTimeFactoryE2ETests
{
    [Fact]
    public void MigrationsAssembly_IncludesReactionAddAndDrop_WithStableIds()
    {
        var factory = new AppDbContextFactory();
        using var ctx = factory.CreateDbContext([]);
        var ids = ctx.Database.GetMigrations().ToList();

        Assert.Contains("20260601204733_Initial", ids);
        Assert.Contains("20260617120000_AddMessageReactions", ids);
        Assert.Contains("20260818120000_AddAttachments", ids);
        Assert.Contains("20261101120000_DropMessageReactions", ids);
        Assert.Contains("20261101140000_AddDeviceLinkTokens", ids);

        // Ordering by id string
        var addIdx = ids.IndexOf("20260617120000_AddMessageReactions");
        var dropIdx = ids.IndexOf("20261101120000_DropMessageReactions");
        Assert.True(addIdx >= 0 && dropIdx > addIdx);
    }

    [Fact]
    public void ModelSnapshot_HasNoMessageReactionsTable()
    {
        var factory = new AppDbContextFactory();
        using var ctx = factory.CreateDbContext([]);
        var tables = ctx.Model.GetEntityTypes()
            .Select(e => e.GetTableName())
            .Where(t => t is not null)
            .ToHashSet(StringComparer.Ordinal);
        Assert.DoesNotContain("message_reactions", tables);
        Assert.Contains("attachments", tables);
        Assert.Contains("device_link_tokens", tables);
    }
}
