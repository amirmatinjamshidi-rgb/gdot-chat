namespace GdotChat.Application.DTOs;

public record SendMessageRequest(
    Guid RecipientUserId,
    Guid RecipientDeviceId,
    int MessageType,
    string CiphertextBase64);

public record MessageEnvelopeDto(
    Guid Id,
    Guid SenderDeviceId,
    Guid SenderUserId,
    int MessageType,
    string CiphertextBase64,
    DateTimeOffset CreatedAt);

public record SessionResetRequest(Guid TargetDeviceId);

public record SessionResetRequestedPayload(Guid FromDeviceId, Guid FromUserId);

public record SendMessageResponse(Guid EnvelopeId);

public record EnvelopeAvailablePayload(Guid EnvelopeId);

public record PreKeysLowPayload(int RemainingCount);

