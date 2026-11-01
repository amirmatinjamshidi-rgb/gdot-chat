using System.Net;
using System.Net.Http.Json;
using GdotChat.Application.DTOs;
using GdotChat.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace GdotChat.Tests.Integration;

[Collection("Integration")]
public sealed class PreKeyUploadTests
{
    private readonly HttpClient _client;
    private readonly GdotChatWebApplicationFactory _factory;

    public PreKeyUploadTests(GdotChatWebApplicationFactory factory)
    {
        _factory = factory;
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task UploadPreKeys_SameSignedKeyId_Upserts_AndOtksAppend()
    {
        var (reg, keys) = TestData.CreateRegisterRequestWithKeys(oneTimePreKeyCount: 3);
        var auth = await _client.RegisterAsync(reg);
        using var authed = _factory.CreateClient();
        authed.SetBearer(auth.AccessToken);

        var body = new UploadPreKeysRequest(
            keys.CreateSignedPreKey(1),
            new List<OneTimePreKeyDto>
            {
                keys.CreateOneTimePreKey(1001),
                keys.CreateOneTimePreKey(1002),
            });

        var first = await authed.PutAsJsonAsync($"/v1/devices/{auth.DeviceId}/prekeys", body);
        Assert.Equal(HttpStatusCode.NoContent, first.StatusCode);

        var second = await authed.PutAsJsonAsync($"/v1/devices/{auth.DeviceId}/prekeys", body);
        Assert.Equal(HttpStatusCode.NoContent, second.StatusCode);

        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<DbContext>();
        var spkCount = await db.Set<SignedPreKey>()
            .CountAsync(k => k.DeviceId == auth.DeviceId && k.KeyId == 1);
        Assert.Equal(1, spkCount);

        var otk1001 = await db.Set<OneTimePreKey>()
            .CountAsync(k => k.DeviceId == auth.DeviceId && k.KeyId == 1001);
        Assert.Equal(1, otk1001);
    }

    [Fact]
    public async Task UploadPreKeys_NewSignedKeyId_Rotates()
    {
        var (reg, keys) = TestData.CreateRegisterRequestWithKeys(oneTimePreKeyCount: 2);
        var auth = await _client.RegisterAsync(reg);
        using var authed = _factory.CreateClient();
        authed.SetBearer(auth.AccessToken);

        var body = new UploadPreKeysRequest(
            keys.CreateSignedPreKey(2),
            new List<OneTimePreKeyDto> { keys.CreateOneTimePreKey(2001) });

        var response = await authed.PutAsJsonAsync($"/v1/devices/{auth.DeviceId}/prekeys", body);
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);

        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<DbContext>();
        var ids = await db.Set<SignedPreKey>()
            .Where(k => k.DeviceId == auth.DeviceId)
            .Select(k => k.KeyId)
            .OrderBy(k => k)
            .ToListAsync();
        Assert.Contains(1, ids);
        Assert.Contains(2, ids);
    }
}
