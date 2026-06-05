import { ApiClient } from "@/lib/api/api-client";
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

const apiClient = new ApiClient(authStore);
const identityStore = new IdentityStore(sqlCipherDatabase);
const cryptoKeyStore = new CryptoKeyStore(sqlCipherDatabase);
const sessionStore = new SessionStore(sqlCipherDatabase);
const crypto = new LibSignalAdapter(
  identityStore,
  cryptoKeyStore,
  sessionStore,
);

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
  identityStore,
  cryptoKeyStore,
  profileStore: new ProfileStore(sqlCipherDatabase),
  draftStore: new DraftStore(sqlCipherDatabase),
  sessionStore,
  messageStore: new MessageStore(sqlCipherDatabase),
  conversationStore: new ConversationStore(sqlCipherDatabase),
  crypto,
  get preKeyManager() {
    return new PreKeyManager(
      crypto,
      this.cryptoKeyStore,
      this.identityStore,
      this.devicesApi,
    );
  },
  get signalService() {
    return new SignalService(
      crypto,
      this.identityStore,
      this.devicesApi,
      this.preKeyManager,
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
