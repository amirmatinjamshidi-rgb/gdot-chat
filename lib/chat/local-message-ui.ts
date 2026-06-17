import type { Reaction } from "@/components/reactions/types";
import { formatConversationTime } from "@/lib/chat/format-conversation-time";
import type { LocalMessage } from "@/lib/db/types";
import type { Message } from "@/stores/messages-store";

/** Map SQLCipher messages to ChatRoom bubble shape (text only from sync). */
export function localMessageToUi(
  m: LocalMessage,
  peerDisplayName: string,
  reactions: Reaction[] = [],
): Message {
  const isMine = m.direction === "outgoing";
  return {
    id: m.id,
    chatId: m.conversationId,
    sender: isMine ? "me" : peerDisplayName,
    time: formatConversationTime(m.createdAt),
    kind: "text",
    text: m.plaintext,
    isMine,
    reactions,
    serverEnvelopeId: m.serverEnvelopeId,
  };
}
