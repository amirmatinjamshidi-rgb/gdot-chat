import type { IConversationStore } from "@/lib/db/conversation-store";
import type { Conversation } from "@/lib/db/types";

export async function ensureConversation(params: {
  conversationStore: IConversationStore;
  peerUserId: string;
  peerUsername: string;
  peerDeviceId: string;
}): Promise<Conversation> {
  const existing = await params.conversationStore.getByPeer(params.peerUserId);
  if (existing) return existing;

  const conversation: Conversation = {
    id: crypto.randomUUID(),
    peerUserId: params.peerUserId,
    peerUsername: params.peerUsername,
    peerDeviceId: params.peerDeviceId,
    lastMessagePreview: "",
    lastMessageAt: Date.now(),
    unreadCount: 0,
  };
  await params.conversationStore.upsert(conversation);
  return conversation;
}
