using org.whispersystems.curve25519;

namespace GdotChat.Application.Security;

/// <summary>
/// XEdDSA (Curve25519) signed-prekey signatures as produced by libsignal
/// (<c>KeyHelper.generateSignedPreKey</c>): sign the SPK public key bytes
/// exactly as stored/sent (typically 33-byte DJB form with leading 0x05) using
/// the identity private key; verify against the 32-byte Montgomery identity
/// public key (0x05 prefix stripped when present).
/// </summary>
public static class SignedPreKeySignature
{
    private static readonly Curve25519 Curve =
        Curve25519.getInstance(Curve25519.BEST);

    public const byte DjbType = 0x05;

    /// <summary>Strip optional DJB type byte from an identity/public key.</summary>
    public static byte[] ToMontgomeryPublic(byte[] publicKey)
    {
        if (publicKey.Length == 33 && publicKey[0] == DjbType)
        {
            var mont = new byte[32];
            Buffer.BlockCopy(publicKey, 1, mont, 0, 32);
            return mont;
        }

        if (publicKey.Length == 32)
            return publicKey;

        throw new ArgumentException(
            $"Identity public key must be 32 or 33 bytes, got {publicKey.Length}");
    }

    public static bool Verify(
        byte[] identityKeyPublic,
        byte[] signedPreKeyPublic,
        byte[] signature)
    {
        if (signature.Length != 64)
            return false;
        if (signedPreKeyPublic.Length is not (32 or 33))
            return false;

        try
        {
            var identityMont = ToMontgomeryPublic(identityKeyPublic);
            // Message is the SPK public key bytes as libsignal signs them
            // (full DJB 33-byte form when that is what the client uploaded).
            return Curve.verifySignature(identityMont, signedPreKeyPublic, signature);
        }
        catch
        {
            return false;
        }
    }

    public static void EnsureValid(
        byte[] identityKeyPublic,
        byte[] signedPreKeyPublic,
        byte[] signature)
    {
        if (!Verify(identityKeyPublic, signedPreKeyPublic, signature))
            throw new Domain.Exceptions.InvalidSignedPreKeySignatureException();
    }

    /// <summary>Test/helper: sign SPK public bytes with an identity private key.</summary>
    public static byte[] Sign(byte[] identityPrivateKey, byte[] signedPreKeyPublic)
    {
        if (identityPrivateKey.Length != 32)
            throw new ArgumentException("Identity private key must be 32 bytes");
        return Curve.calculateSignature(identityPrivateKey, signedPreKeyPublic);
    }

    public static (byte[] PrivateKey, byte[] PublicKeyDjb) GenerateIdentityKeyPair()
    {
        var pair = Curve.generateKeyPair();
        var pubDjb = new byte[33];
        pubDjb[0] = DjbType;
        Buffer.BlockCopy(pair.getPublicKey(), 0, pubDjb, 1, 32);
        return (pair.getPrivateKey(), pubDjb);
    }

    public static byte[] GeneratePublicKeyDjb()
    {
        var pair = Curve.generateKeyPair();
        var pubDjb = new byte[33];
        pubDjb[0] = DjbType;
        Buffer.BlockCopy(pair.getPublicKey(), 0, pubDjb, 1, 32);
        return pubDjb;
    }
}
