using System.Collections.Concurrent;
using GdotChat.Application.Interfaces;

namespace GdotChat.Infrastructure.Storage;

public sealed class InMemoryAttachmentStorage : IAttachmentStorage
{
    private readonly ConcurrentDictionary<string, byte[]> _objects = new();

    public Task PutChunkAsync(
        Guid attachmentId,
        int chunkIndex,
        Stream ciphertext,
        long sizeBytes,
        CancellationToken ct = default)
    {
        using var ms = new MemoryStream();
        ciphertext.CopyTo(ms);
        if (ms.Length != sizeBytes)
            throw new InvalidOperationException("chunk stream length mismatch");
        _objects[Key(attachmentId, chunkIndex)] = ms.ToArray();
        return Task.CompletedTask;
    }

    public Task GetChunkAsync(
        Guid attachmentId,
        int chunkIndex,
        Stream destination,
        CancellationToken ct = default)
    {
        if (!_objects.TryGetValue(Key(attachmentId, chunkIndex), out var bytes))
            throw new FileNotFoundException("chunk missing");
        destination.Write(bytes, 0, bytes.Length);
        return Task.CompletedTask;
    }

    public Task<bool> ChunkExistsAsync(
        Guid attachmentId,
        int chunkIndex,
        CancellationToken ct = default) =>
        Task.FromResult(_objects.ContainsKey(Key(attachmentId, chunkIndex)));

    public Task<long?> GetChunkSizeAsync(
        Guid attachmentId,
        int chunkIndex,
        CancellationToken ct = default)
    {
        if (!_objects.TryGetValue(Key(attachmentId, chunkIndex), out var bytes))
            return Task.FromResult<long?>(null);
        return Task.FromResult<long?>(bytes.LongLength);
    }

    public async Task<IReadOnlyList<StoredChunkInfo>> ListChunksAsync(
        Guid attachmentId,
        int chunkCount,
        CancellationToken ct = default)
    {
        var list = new List<StoredChunkInfo>();
        for (var i = 0; i < chunkCount; i++)
        {
            var size = await GetChunkSizeAsync(attachmentId, i, ct);
            if (size is not null)
                list.Add(new StoredChunkInfo(i, size.Value));
        }
        return list;
    }

    public Task DeleteAttachmentAsync(
        Guid attachmentId,
        int chunkCount,
        CancellationToken ct = default)
    {
        for (var i = 0; i < chunkCount; i++)
            _objects.TryRemove(Key(attachmentId, i), out _);
        return Task.CompletedTask;
    }

    private static string Key(Guid attachmentId, int chunkIndex) =>
        $"attachments/{attachmentId:D}/{chunkIndex:D6}";
}