using System.Security.Claims;
using GdotChat.Application.DTOs;
using GdotChat.Domain.Entities;

namespace GdotChat.Application.Interfaces;

public interface IAuthService
{
    Task<AuthResultDto> RegisterAsync(RegisterRequest request, CancellationToken ct = default);
    Task<AuthResultDto> LoginAsync(LoginRequest request, CancellationToken ct = default);
    Task<AuthResultDto> RefreshAsync(string refreshToken, CancellationToken ct = default);
}

public interface IUserService
{
    Task<User> CreateUserAsync(string username, string passwordHash, CancellationToken ct = default);
    Task<User?> FindByUsernameAsync(string username, CancellationToken ct = default);
    Task<User> GetByIdAsync(Guid userId, CancellationToken ct = default);
    Task<IReadOnlyList<UserSummaryDto>> SearchByUsernameAsync(string query, int limit, CancellationToken ct = default);
}

public interface IDeviceService
{
    Task<Device> RegisterDeviceWithPreKeysAsync(Guid userId, RegisterDeviceRequest request, CancellationToken ct = default);
    Task UploadPreKeysAsync(Guid callerDeviceId, Guid deviceId, UploadPreKeysRequest request, CancellationToken ct = default);
    Task<PreKeyBundleDto> GetPreKeyBundleAsync(Guid userId, Guid deviceId, CancellationToken ct = default);
    Task<IReadOnlyList<DeviceSummaryDto>> ListDevicesForUserAsync(Guid userId, CancellationToken ct = default);
    Task<int> CountAvailableOneTimePreKeysAsync(Guid deviceId, CancellationToken ct = default);
}

public interface IMessageRelayService
{
    Task<Guid> EnqueueAsync(Guid senderDeviceId, SendMessageRequest request, CancellationToken ct = default);
    Task<IReadOnlyList<MessageEnvelopeDto>> GetPendingForDeviceAsync(Guid deviceId, int limit, CancellationToken ct = default);
    Task AckAsync(Guid deviceId, Guid envelopeId, CancellationToken ct = default);
    Task<int> PurgeExpiredAsync(CancellationToken ct = default);
}

public interface IJwtTokenService
{
    string CreateAccessToken(User user, Device device, IReadOnlyCollection<string>? scopes = null);
    string CreateRefreshTokenPlaintext();
    string HashRefreshToken(string plaintext);
    ClaimsPrincipal ValidateAccessToken(string token);
    DateTimeOffset GetAccessTokenExpiry();
}

public interface IPasswordHasher
{
    string Hash(string password);
    bool Verify(string password, string hash);
}

public interface IAttachmentService
{
    Task<CreateAttachmentResponse> CreateAsync(
        Guid senderDeviceId,
        CreateAttachmentRequest request,
        CancellationToken ct = default);

    Task PutChunkAsync(
        Guid senderDeviceId,
        Guid attachmentId,
        int chunkIndex,
        Stream body,
        long? contentLength,
        CancellationToken ct = default);

    Task<AttachmentStatusDto> GetStatusAsync(
        Guid callerDeviceId,
        Guid attachmentId,
        CancellationToken ct = default);

    Task CompleteAsync(Guid senderDeviceId, Guid attachmentId, CancellationToken ct = default);

    Task GetChunkAsync(
        Guid recipientDeviceId,
        Guid attachmentId,
        int chunkIndex,
        Stream destination,
        CancellationToken ct = default);

    Task DownloadCompleteAsync(
        Guid recipientDeviceId,
        Guid attachmentId,
        CancellationToken ct = default);

    Task DeleteAsync(Guid senderDeviceId, Guid attachmentId, CancellationToken ct = default);

    Task<int> PurgeExpiredAsync(CancellationToken ct = default);
}

public interface ISessionResetService
{
    Task RequestAsync(Guid callerDeviceId, Guid callerUserId, Guid targetDeviceId, CancellationToken ct = default);
}

public interface IMessageNotifier
{
    Task NotifyEnvelopeAvailableAsync(Guid recipientDeviceId, Guid envelopeId, CancellationToken ct = default);
    Task NotifyPreKeysLowAsync(Guid deviceId, int remainingCount, CancellationToken ct = default);
    Task NotifySessionResetRequestedAsync(
        Guid targetDeviceId,
        Guid fromDeviceId,
        Guid fromUserId,
        CancellationToken ct = default);
}
