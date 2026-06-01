using System.Text;
using GdotChat.Application.DTOs;

namespace GdotChat.Tests.Integration;

internal static class TestData
{
    private static int _counter;

    public static string UniqueUsername() => $"user{Interlocked.Increment(ref _counter)}";

    public static RegisterRequest CreateRegisterRequest(
        string? username = null,
        int oneTimePreKeyCount = 100)
    {
        var spk = new SignedPreKeyDto(1, B64(32), B64(64));
        var otks = Enumerable.Range(1, oneTimePreKeyCount)
            .Select(i => new OneTimePreKeyDto(i, B64(32)))
            .ToList();

        return new RegisterRequest(
            username ?? UniqueUsername(),
            "password-123",
            new RegisterDeviceRequest(
                "test-device",
                Random.Shared.Next(1, int.MaxValue),
                B64(32),
                spk,
                otks));
    }

    public static string B64(int byteLength) =>
        Convert.ToBase64String(Encoding.UTF8.GetBytes(new string('x', byteLength)));
}
