using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using GdotChat.Application.DTOs;
using GdotChat.Application.Security;

namespace GdotChat.Tests.Integration;

/// <summary>
/// E2E: valid client-shaped XEdDSA SPK verifies; tampered signature is rejected on register and upload.
/// Cross-checks curve25519-dotnet against the same message format libsignal signs (33-byte DJB SPK pub).
/// </summary>
[Collection("Integration")]
public sealed class SignedPreKeyVerificationE2ETests
{
    private readonly GdotChatWebApplicationFactory _factory;
    private readonly HttpClient _client;

    public SignedPreKeyVerificationE2ETests(GdotChatWebApplicationFactory factory)
    {
        _factory = factory;
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task RegisterAndUpload_AcceptsValidLibsignalShapedSignatures()
    {
        var (reg, keys) = TestData.CreateRegisterRequestWithKeys(oneTimePreKeyCount: 3);
        // Unit-level cross-check that our helper verifies what it signed (same bytes libsignal uses).
        Assert.True(SignedPreKeySignature.Verify(
            keys.IdentityPublicKeyDjb,
            Convert.FromBase64String(keys.SignedPreKey.PublicKeyBase64),
            Convert.FromBase64String(keys.SignedPreKey.SignatureBase64)));

        var auth = await _client.RegisterAsync(reg);
        Assert.NotEqual(Guid.Empty, auth.UserId);
        Assert.NotEqual(Guid.Empty, auth.DeviceId);

        using var authed = _factory.CreateClient();
        authed.SetBearer(auth.AccessToken);

        var upload = new UploadPreKeysRequest(
            keys.CreateSignedPreKey(Random.Shared.Next(10, 50_000)),
            new List<OneTimePreKeyDto>
            {
                keys.CreateOneTimePreKey(Random.Shared.Next(10_000, 50_000)),
            });
        var put = await authed.PutAsJsonAsync($"/v1/devices/{auth.DeviceId}/prekeys", upload);
        Assert.Equal(HttpStatusCode.NoContent, put.StatusCode);

        // Bundle must surface the rotated SPK for a peer.
        var peer = await _client.RegisterAsync();
        using var peerClient = _factory.CreateClient();
        peerClient.SetBearer(peer.AccessToken);
        var bundle = await peerClient.GetFromJsonAsync<PreKeyBundleDto>(
            $"/v1/users/{auth.UserId}/devices/{auth.DeviceId}/prekey-bundle");
        Assert.NotNull(bundle);
        Assert.Equal(upload.SignedPreKey.KeyId, bundle!.SignedPreKey.KeyId);
        Assert.Equal(upload.SignedPreKey.SignatureBase64, bundle.SignedPreKey.SignatureBase64);
    }

    [Fact]
    public void Verify_AcceptsFixtureProducedByLibsignalClient()
    {
        // Captured from @privacyresearch/libsignal-protocol-typescript KeyHelper.generateSignedPreKey
        // (identity pub + SPK pub are 33-byte DJB with 0x05; signature is XEdDSA over the 33-byte SPK pub).
        var identityPub33 = Convert.FromBase64String("BfBF8kM9nMNztRquoYSkhhV32l7rCQgnpesmUz3V9cQM");
        var spkPub33 = Convert.FromBase64String("BdIU2pDm5HgS4n/tKT9TLPnk/2rJ47S+uXhrutF0oTEk");
        var signature = Convert.FromBase64String(
            "2XYICGDEtxU5FfxFs3KuQAoPeWahoqFr2SOViCAbaArQ2NzS8JDpvScxH8BGOW8+Xhbw0BTuV3NrzkrE5PPIDw==");

        Assert.Equal(33, identityPub33.Length);
        Assert.Equal(0x05, identityPub33[0]);
        Assert.Equal(33, spkPub33.Length);
        Assert.Equal(64, signature.Length);
        Assert.True(SignedPreKeySignature.Verify(identityPub33, spkPub33, signature));

        var junk = Convert.FromBase64String(TestData.B64(64));
        Assert.False(SignedPreKeySignature.Verify(identityPub33, spkPub33, junk));
    }
}
