using GdotChat.Application.Interfaces;
using GdotChat.Application.Options;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Minio;
using Minio.DataModel.Args;
using Minio.DataModel.Encryption;
using Minio.Exceptions;

namespace GdotChat.Infrastructure.Storage;

public sealed class MinioAttachmentStorage : IAttachmentStorage
{
    private readonly IMinioClient _client;
    private readonly MinioOptions _options;
    private readonly ILogger<MinioAttachmentStorage> _logger;
    private readonly SemaphoreSlim _bucketLock = new(1, 1);
    private bool _bucketReady;

    public MinioAttachmentStorage(
        IMinioClient client,
        IOptions<MinioOptions> options,
        ILogger<MinioAttachmentStorage> logger)
    {
        _client = client;
        _options = options.Value;
        _logger = logger;
    }

    public async Task PutChunkAsync(
        Guid attachmentId,
        int chunkIndex,
        Stream ciphertext,
        long sizeBytes,
        CancellationToken ct = default)
    {
        await EnsureBucketAsync(ct);
        var args = new PutObjectArgs()
            .WithBucket(_options.Bucket)
            .WithObject(ObjectName(attachmentId, chunkIndex))
            .WithStreamData(ciphertext)
            .WithObjectSize(sizeBytes)
            .WithContentType("application/octet-stream");
        ApplySse(args);
        await _client.PutObjectAsync(args, ct);
    }

    public async Task GetChunkAsync(
        Guid attachmentId,
        int chunkIndex,
        Stream destination,
        CancellationToken ct = default)
    {
        await EnsureBucketAsync(ct);
        try
        {
            var args = new GetObjectArgs()
                .WithBucket(_options.Bucket)
                .WithObject(ObjectName(attachmentId, chunkIndex))
                .WithCallbackStream(async (stream, token) =>
                {
                    await stream.CopyToAsync(destination, token);
                });
            await _client.GetObjectAsync(args, ct);
        }
        catch (ObjectNotFoundException)
        {
            throw new FileNotFoundException("chunk missing");
        }
        catch (MinioException ex) when (ex.Message.Contains("Not Found", StringComparison.OrdinalIgnoreCase))
        {
            throw new FileNotFoundException("chunk missing");
        }
    }

    public async Task<bool> ChunkExistsAsync(
        Guid attachmentId,
        int chunkIndex,
        CancellationToken ct = default)
    {
        var size = await GetChunkSizeAsync(attachmentId, chunkIndex, ct);
        return size is not null;
    }

    public async Task<long?> GetChunkSizeAsync(
        Guid attachmentId,
        int chunkIndex,
        CancellationToken ct = default)
    {
        await EnsureBucketAsync(ct);
        try
        {
            var stat = await _client.StatObjectAsync(
                new StatObjectArgs()
                    .WithBucket(_options.Bucket)
                    .WithObject(ObjectName(attachmentId, chunkIndex)),
                ct);
            return stat.Size;
        }
        catch (ObjectNotFoundException)
        {
            return null;
        }
        catch (MinioException ex) when (ex.Message.Contains("Not Found", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }
    }

    public async Task<IReadOnlyList<StoredChunkInfo>> ListChunksAsync(
        Guid attachmentId,
        int chunkCount,
        CancellationToken ct = default)
    {
        var found = new List<StoredChunkInfo>();
        for (var i = 0; i < chunkCount; i++)
        {
            var size = await GetChunkSizeAsync(attachmentId, i, ct);
            if (size is not null)
                found.Add(new StoredChunkInfo(i, size.Value));
        }
        return found;
    }

    public async Task DeleteAttachmentAsync(
        Guid attachmentId,
        int chunkCount,
        CancellationToken ct = default)
    {
        await EnsureBucketAsync(ct);
        for (var i = 0; i < chunkCount; i++)
        {
            try
            {
                await _client.RemoveObjectAsync(
                    new RemoveObjectArgs()
                        .WithBucket(_options.Bucket)
                        .WithObject(ObjectName(attachmentId, i)),
                    ct);
            }
            catch (ObjectNotFoundException)
            {
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to delete chunk {AttachmentId}/{Index}", attachmentId, i);
            }
        }
    }

    private async Task EnsureBucketAsync(CancellationToken ct)
    {
        if (_bucketReady) return;
        await _bucketLock.WaitAsync(ct);
        try
        {
            if (_bucketReady) return;
            var exists = await _client.BucketExistsAsync(
                new BucketExistsArgs().WithBucket(_options.Bucket), ct);
            if (!exists)
            {
                await _client.MakeBucketAsync(
                    new MakeBucketArgs().WithBucket(_options.Bucket).WithLocation(_options.Region),
                    ct);
            }
            _bucketReady = true;
        }
        finally
        {
            _bucketLock.Release();
        }
    }

    private void ApplySse(PutObjectArgs args)
    {
        if (_options.UseServerSideEncryption)
            args.WithServerSideEncryption(new SSES3());
    }

    private static string Prefix(Guid attachmentId) => $"attachments/{attachmentId:D}/";

    private static string ObjectName(Guid attachmentId, int chunkIndex) =>
        $"{Prefix(attachmentId)}{chunkIndex:D6}";
}