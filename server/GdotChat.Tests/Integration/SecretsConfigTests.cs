using System.Text.Json;

namespace GdotChat.Tests.Integration;

/// <summary>
/// API/config guard: committed appsettings must not contain DB/MinIO secrets.
/// </summary>
public sealed class SecretsConfigTests
{
    private static string FindRepoRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            var candidate = Path.Combine(dir.FullName, "server", "GdotChat.Api", "appsettings.json");
            if (File.Exists(candidate))
                return dir.FullName;
            // Running from inside server/
            candidate = Path.Combine(dir.FullName, "GdotChat.Api", "appsettings.json");
            if (File.Exists(candidate))
                return dir.Parent!.FullName;
            dir = dir.Parent;
        }

        throw new InvalidOperationException("Could not locate repo root from " + AppContext.BaseDirectory);
    }

    [Theory]
    [InlineData("server/GdotChat.Api/appsettings.json")]
    [InlineData("server/GdotChat.Api/appsettings.Development.json")]
    public void CommittedAppsettings_HaveNoDbOrMinioSecrets(string relativePath)
    {
        var root = FindRepoRoot();
        var path = Path.Combine(root, relativePath);
        Assert.True(File.Exists(path), path);
        using var doc = JsonDocument.Parse(File.ReadAllText(path));
        var rootEl = doc.RootElement;

        if (rootEl.TryGetProperty("ConnectionStrings", out var css)
            && css.TryGetProperty("Default", out var cs))
        {
            var value = cs.GetString() ?? "";
            Assert.DoesNotContain("Password=", value, StringComparison.OrdinalIgnoreCase);
        }

        if (rootEl.TryGetProperty("Minio", out var minio))
        {
            if (minio.TryGetProperty("AccessKey", out var ak))
                Assert.True(string.IsNullOrEmpty(ak.GetString()));
            if (minio.TryGetProperty("SecretKey", out var sk))
                Assert.True(string.IsNullOrEmpty(sk.GetString()));
        }
    }

    [Fact]
    public void EnvExample_Exists_WithPlaceholderValuesOnly()
    {
        var root = FindRepoRoot();
        var example = Path.Combine(root, ".env.example");
        Assert.True(File.Exists(example), example);
        foreach (var line in File.ReadAllLines(example))
        {
            var trimmed = line.Trim();
            if (string.IsNullOrEmpty(trimmed) || trimmed.StartsWith('#'))
                continue;
            var idx = trimmed.IndexOf('=');
            Assert.True(idx > 0, "expected KEY= form");
            var value = trimmed[(idx + 1)..];
            Assert.True(
                string.IsNullOrEmpty(value),
                ".env.example must list key names only (empty values)");
        }
    }

    [Fact]
    public void Gitignore_IncludesEnv()
    {
        var root = FindRepoRoot();
        var gitignore = File.ReadAllText(Path.Combine(root, ".gitignore"));
        Assert.Contains(".env", gitignore.Split('\n').Select(l => l.Trim()));
    }
}
