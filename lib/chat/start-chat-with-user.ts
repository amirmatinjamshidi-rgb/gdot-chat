import type { UsersApi } from "@/lib/api/users-api";
import { ensureConversation } from "@/lib/auth/start-conversation";
import type { SignalService } from "@/lib/crypto/signal-service";
import type { IConversationStore } from "@/lib/db/conversation-store";
import type { IIdentityStore } from "@/lib/db/identity-store";
import type { Conversation } from "@/lib/db/types";

export class StartChatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StartChatError";
  }
}

export async function startChatWithUser(params: {
  peerUserId: string;
  peerUsername: string;
  usersApi: UsersApi;
  conversationStore: IConversationStore;
  identityStore: IIdentityStore;
  signalService: SignalService;
}): Promise<Conversation> {
  const local = await params.identityStore.getLocalIdentity();
  if (local && local.userId === params.peerUserId) {
    throw new StartChatError("You cannot start a chat with yourself.");
  }

  const devices = await params.usersApi.listDevices(params.peerUserId);
  const peerDeviceId = devices[0]?.deviceId;
  if (!peerDeviceId) {
    throw new StartChatError("This user has no registered devices yet.");
  }

  const conversation = await ensureConversation({
    conversationStore: params.conversationStore,
    peerUserId: params.peerUserId,
    peerUsername: params.peerUsername,
    peerDeviceId,
  });

  await params.signalService.ensureSession(
    params.peerUserId,
    conversation.peerDeviceId,
  );

  return conversation;
}
