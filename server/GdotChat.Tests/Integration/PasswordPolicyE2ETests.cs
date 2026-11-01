using System.Net;
using System.Net.Http.Json;
using GdotChat.Application.DTOs;

namespace GdotChat.Tests.Integration;

/// <summary>
/// E2E: full register → login path with fresh random users; weak passwords rejected end-to-end.
/// </summary>
[Collection("Integration")]
public sealed class PasswordPolicyE2ETests
{
    private readonly HttpClient _client;

    public PasswordPolicyE2ETests(GdotChatWebApplicationFactory factory) =>
        _client = factory.CreateClient();

    [Fact]
    public async Task RegisterLogin_RejectsWeakThenAcceptsStrong()
    {
        var username = TestData.UniqueUsername();
        var weak = TestData.CreateRegisterRequest(username) with { Password = "123" };
        var weakResponse = await _client.PostAsJsonAsync("/v1/auth/register", weak);
        Assert.Equal(HttpStatusCode.BadRequest, weakResponse.StatusCode);

        var strong = TestData.CreateRegisterRequest(username) with { Password = "strong-pass-99" };
        var regResponse = await _client.PostAsJsonAsync("/v1/auth/register", strong);
        Assert.Equal(HttpStatusCode.Created, regResponse.StatusCode);
        var reg = (await regResponse.Content.ReadFromJsonAsync<AuthResultDto>())!;

        var loginResponse = await _client.PostAsJsonAsync(
            "/v1/auth/login",
            new LoginRequest(username, "strong-pass-99", reg.DeviceId));
        loginResponse.EnsureSuccessStatusCode();
        var login = await loginResponse.Content.ReadFromJsonAsync<AuthResultDto>();
        Assert.Equal(reg.UserId, login!.UserId);
    }
}
