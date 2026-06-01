import { ApiClient } from "@/lib/api/api-client";
import { AuthApi } from "@/lib/api/auth-api";
import { DevicesApi } from "@/lib/api/devices-api";
import { MessagesApi } from "@/lib/api/messages-api";
import { SignalRClient } from "@/lib/api/signalr-client";
import { UsersApi } from "@/lib/api/users-api";
import { LibSignalAdapter } from "@/lib/crypto/libsignal-adapter";
import { SignalService } from "@/lib/crypto/signal-service";
import { ConversationStore } from "@/lib/db/conversation-store";
import { sqlCipherDatabase } from "@/lib/db/database";
import { IdentityStore } from "@/lib/db/identity-store";
import { kekManager } from "@/lib/db/kek-manager";
import { MessageStore } from "@/lib/db/message-store";
import { SessionStore } from "@/lib/db/session-store";
import { authStore } from "@/lib/session/auth-store";
import { appLockStore } from "@/lib/session/app-lock-store";
import { SyncService } from "@/lib/session/sync-service";

const apiClient = new ApiClient(authStore);
const crypto = new LibSignalAdapter();

export const appServices = {
  authStore,
  appLockStore,
  kekManager,
  db: sqlCipherDatabase,
  apiClient,
  authApi: new AuthApi(apiClient),
  devicesApi: new DevicesApi(apiClient),
  messagesApi: new MessagesApi(apiClient),
  usersApi: new UsersApi(apiClient),
  signalr: new SignalRClient(authStore),
  identityStore: new IdentityStore(sqlCipherDatabase),
  sessionStore: new SessionStore(sqlCipherDatabase),
  messageStore: new MessageStore(sqlCipherDatabase),
  conversationStore: new ConversationStore(sqlCipherDatabase),
  crypto,
  get signalService() {
    return new SignalService(
      crypto,
      this.sessionStore,
      this.identityStore,
      this.devicesApi,
    );
  },
  get syncService() {
    return new SyncService(
      this.messagesApi,
      this.signalr,
      this.signalService,
      this.messageStore,
      this.conversationStore,
      this.identityStore,
      this.authStore,
    );
  },
};

export type AppServices = typeof appServices;
