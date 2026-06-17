namespace GdotChat.Application.DTOs;

public record SendMessageRequest(
    Guid RecipientUserId,
    Guid RecipientDeviceId,
    int MessageType,
    string CiphertextBase64);

public record MessageEnvelopeDto(
    Guid Id,
    Guid SenderDeviceId,
    int MessageType,
    string CiphertextBase64,
    DateTimeOffset CreatedAt);

public record SendMessageResponse(Guid EnvelopeId);

public record EnvelopeAvailablePayload(Guid EnvelopeId);

public record PreKeysLowPayload(int RemainingCount);

public record ReactionRequest(
    string MessageId,
    string ConversationId,
    string Emoji,
    string UserId,
    Guid RecipientDeviceId,
    string? ServerEnvelopeId);

public record ReactionPayload(
    string MessageId,
    string ConversationId,
    string Emoji,
    string UserId,
    string? ServerEnvelopeId);
