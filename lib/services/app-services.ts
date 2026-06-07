import { ApiClient } from "@/lib/api/api-client";
import { ENABLE_SIGNALR } from "@/lib/config";
import { AuthApi } from "@/lib/api/auth-api";
import { DevicesApi } from "@/lib/api/devices-api";
import { MessagesApi } from "@/lib/api/messages-api";
import { SignalRClient } from "@/lib/api/signalr-client";
import { UsersApi } from "@/lib/api/users-api";
import { LibSignalAdapter } from "@/lib/crypto/libsignal-adapter";
import { PreKeyManager } from "@/lib/crypto/pre-key-manager";
import { SignalService } from "@/lib/crypto/signal-service";
import { ConversationStore } from "@/lib/db/conversation-store";
import { CryptoKeyStore } from "@/lib/db/crypto-key-store";
import { sqlCipherDatabase } from "@/lib/db/database";
import { DraftStore } from "@/lib/db/draft-store";
import { IdentityStore } from "@/lib/db/identity-store";
import { kekManager } from "@/lib/db/kek-manager";
import { MessageStore } from "@/lib/db/message-store";
import { ProfileStore } from "@/lib/db/profile-store";
import { SessionStore } from "@/lib/db/session-store";
import { authStore } from "@/lib/session/auth-store";
import { appLockStore } from "@/lib/session/app-lock-store";
import { SyncService } from "@/lib/session/sync-service";

const signalr = new SignalRClient(authStore);
const apiClient = new ApiClient(authStore);

authStore.onTokensUpdated(() => {
  if (ENABLE_SIGNALR) {
    void signalr.reconnect();
  }
});
const identityStore = new IdentityStore(sqlCipherDatabase);
const cryptoKeyStore = new CryptoKeyStore(sqlCipherDatabase);
const sessionStore = new SessionStore(sqlCipherDatabase);
const crypto = new LibSignalAdapter(
  identityStore,
  cryptoKeyStore,
  sessionStore,
);
const devicesApi = new DevicesApi(apiClient);
const messagesApi = new MessagesApi(apiClient);
const messageStore = new MessageStore(sqlCipherDatabase);
const conversationStore = new ConversationStore(sqlCipherDatabase);
const preKeyManager = new PreKeyManager(
  crypto,
  cryptoKeyStore,
  identityStore,
  devicesApi,
);
const signalService = new SignalService(
  crypto,
  identityStore,
  devicesApi,
  preKeyManager,
);
const syncService = new SyncService(
  messagesApi,
  signalr,
  signalService,
  messageStore,
  conversationStore,
  identityStore,
  authStore,
);

export const appServices = {
  authStore,
  appLockStore,
  kekManager,
  db: sqlCipherDatabase,
  apiClient,
  authApi: new AuthApi(apiClient),
  devicesApi,
  messagesApi,
  usersApi: new UsersApi(apiClient),
  signalr,
  identityStore,
  cryptoKeyStore,
  profileStore: new ProfileStore(sqlCipherDatabase),
  draftStore: new DraftStore(sqlCipherDatabase),
  sessionStore,
  messageStore,
  conversationStore,
  crypto,
  preKeyManager,
  signalService,
  syncService,
};

export type AppServices = typeof appServices;
