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
        var auth = await _client.RegisterAsync(TestData.CreateRegisterRequest(oneTimePreKeyCount: 3));
        using var authed = _factory.CreateClient();
        authed.SetBearer(auth.AccessToken);

        var body = new UploadPreKeysRequest(
            new SignedPreKeyDto(1, TestData.B64(32), TestData.B64(64)),
            new List<OneTimePreKeyDto>
            {
                new(1001, TestData.B64(32)),
                new(1002, TestData.B64(32)),
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
        var auth = await _client.RegisterAsync(TestData.CreateRegisterRequest(oneTimePreKeyCount: 2));
        using var authed = _factory.CreateClient();
        authed.SetBearer(auth.AccessToken);

        var body = new UploadPreKeysRequest(
            new SignedPreKeyDto(2, TestData.B64(32), TestData.B64(64)),
            new List<OneTimePreKeyDto> { new(2001, TestData.B64(32)) });

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
