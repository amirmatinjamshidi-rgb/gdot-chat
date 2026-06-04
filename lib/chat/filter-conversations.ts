import type { Conversation } from "@/lib/db/types";

export function filterConversations(
  conversations: Conversation[],
  query: string,
): Conversation[] {
  const q = query.trim().toLowerCase();
  if (!q) return conversations;
  return conversations.filter(
    (c) =>
      c.peerUsername.toLowerCase().includes(q) ||
      c.lastMessagePreview.toLowerCase().includes(q),
  );
}
