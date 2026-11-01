namespace GdotChat.Application.Interfaces;

public sealed record StoredChunkInfo(int Index, long SizeBytes);

public interface IAttachmentStorage
{
    Task PutChunkAsync(
        Guid attachmentId,
        int chunkIndex,
        Stream ciphertext,
        long sizeBytes,
        CancellationToken ct = default);

    Task GetChunkAsync(
        Guid attachmentId,
        int chunkIndex,
        Stream destination,
        CancellationToken ct = default);

    Task<bool> ChunkExistsAsync(
        Guid attachmentId,
        int chunkIndex,
        CancellationToken ct = default);

    Task<long?> GetChunkSizeAsync(
        Guid attachmentId,
        int chunkIndex,
        CancellationToken ct = default);

    Task<IReadOnlyList<StoredChunkInfo>> ListChunksAsync(
        Guid attachmentId,
        int chunkCount,
        CancellationToken ct = default);

    Task DeleteAttachmentAsync(
        Guid attachmentId,
        int chunkCount,
        CancellationToken ct = default);
}