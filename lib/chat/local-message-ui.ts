import type { Reaction } from "@/components/reactions/types";
import { formatConversationTime } from "@/lib/chat/format-conversation-time";
import type { LocalAttachment, LocalMessage } from "@/lib/db/types";
import type { Message } from "@/stores/messages-store";

export function localMessageToUi(
  m: LocalMessage,
  peerDisplayName: string,
  reactions: Reaction[] = [],
  attachment?: LocalAttachment | null,
): Message {
  const isMine = m.direction === "outgoing";
  const kind = m.kind === "voice" || m.kind === "video" ? m.kind : "text";
  return {
    id: m.id,
    chatId: m.conversationId,
    sender: isMine ? "me" : peerDisplayName,
    time: formatConversationTime(m.createdAt),
    kind,
    text: kind === "text" ? m.plaintext : undefined,
    durationMs: attachment?.durationMs,
    mediaUri: (() => {
      if (!attachment) return undefined;
      if (!(m.direction === "outgoing" || attachment.transferState === "available")) {
        return undefined;
      }
      // At-rest ciphertext plays via native EncryptedVideo/Audio — never hand .genc to AV players.
      if (attachment.atRestEncrypted || attachment.nativePlaybackReady) return undefined;
      if (attachment.localUri?.endsWith(".genc")) return undefined;
      return attachment.localUri ?? undefined;
    })(),
    encryptedPlayback: (() => {
      if (!attachment) return false;
      if (!(m.direction === "outgoing" || attachment.transferState === "available")) {
        return false;
      }
      return !!(
        attachment.nativePlaybackReady ||
        attachment.atRestEncrypted ||
        attachment.localUri?.endsWith(".genc")
      );
    })(),
    isMine,
    reactions,
    serverEnvelopeId: m.serverEnvelopeId,
    attachmentId: m.attachmentId,
    transferState: attachment?.transferState ?? m.status,
    deliveryStatus: isMine && kind === "text" ? m.status : undefined,
  };
}