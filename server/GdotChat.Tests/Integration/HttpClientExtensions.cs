using System.Net.Http.Headers;
using System.Net.Http.Json;
using GdotChat.Application.DTOs;

namespace GdotChat.Tests.Integration;

internal static class HttpClientExtensions
{
    public static async Task<AuthResultDto> RegisterAsync(
        this HttpClient client,
        RegisterRequest? request = null)
    {
        request ??= TestData.CreateRegisterRequest();
        var response = await client.PostAsJsonAsync("/v1/auth/register", request);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<AuthResultDto>())!;
    }

    public static void SetBearer(this HttpClient client, string accessToken) =>
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", accessToken);
}
