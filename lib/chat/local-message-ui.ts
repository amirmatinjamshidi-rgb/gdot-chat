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
    mediaUri:
      attachment?.localUri &&
      (m.direction === "outgoing" || attachment.transferState === "available")
        ? attachment.localUri
        : undefined,
    isMine,
    reactions,
    serverEnvelopeId: m.serverEnvelopeId,
    attachmentId: m.attachmentId,
    transferState: attachment?.transferState ?? m.status,
  };
}