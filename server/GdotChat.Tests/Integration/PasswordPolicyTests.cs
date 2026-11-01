using System.Net;
using System.Net.Http.Json;
using GdotChat.Application.DTOs;

namespace GdotChat.Tests.Integration;

[Collection("Integration")]
public sealed class PasswordPolicyTests
{
    private readonly HttpClient _client;

    public PasswordPolicyTests(GdotChatWebApplicationFactory factory) =>
        _client = factory.CreateClient();

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("short")]
    [InlineData("has space1")]
    public async Task Register_WeakPassword_Returns400(string password)
    {
        var req = TestData.CreateRegisterRequest();
        req = req with { Password = password };

        var response = await _client.PostAsJsonAsync("/v1/auth/register", req);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Register_PasswordTooLong_Returns400()
    {
        var req = TestData.CreateRegisterRequest() with
        {
            Password = new string('a', 129),
        };
        var response = await _client.PostAsJsonAsync("/v1/auth/register", req);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Register_ValidPassword_Returns201()
    {
        var req = TestData.CreateRegisterRequest() with { Password = "password-123" };
        var response = await _client.PostAsJsonAsync("/v1/auth/register", req);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<AuthResultDto>();
        Assert.NotEqual(Guid.Empty, body!.UserId);
    }
}
