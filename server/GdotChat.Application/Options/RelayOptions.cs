namespace GdotChat.Application.Options;

public class RelayOptions
{
    public const string SectionName = "Relay";

    public int EnvelopeTtlDays { get; set; } = 7;
    public int PreKeyLowThreshold { get; set; } = 10;

    /// <summary>
    /// Maximum ciphertext length (bytes after Base64 decode) accepted by POST /v1/messages.
    /// Derived from the client plaintext limit of 10_000 characters:
    /// worst-case UTF-8 is 4 bytes/char → 40_000 bytes, plus JSON text-payload wrapper
    /// (~32 bytes) and Signal PreKeyWhisperMessage / session overhead (a few KiB).
    /// 64 KiB (65536) is a documented bound with headroom without unbounded relay storage.
    /// </summary>
    public int MaxCiphertextBytes { get; set; } = 64 * 1024;
}
