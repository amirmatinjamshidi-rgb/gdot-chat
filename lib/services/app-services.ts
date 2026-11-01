import { ApiClient } from "@/lib/api/api-client";
import { AttachmentsApi } from "@/lib/api/attachments-api";
import { ENABLE_SIGNALR } from "@/lib/config";
import { AuthApi } from "@/lib/api/auth-api";
import { DevicesApi } from "@/lib/api/devices-api";
import { MessagesApi } from "@/lib/api/messages-api";
import { SessionResetApi } from "@/lib/api/session-reset-api";
import { SignalRClient } from "@/lib/api/signalr-client";
import { UsersApi } from "@/lib/api/users-api";
import { LibSignalAdapter } from "@/lib/crypto/libsignal-adapter";
import { PreKeyManager } from "@/lib/crypto/pre-key-manager";
import { SignalService } from "@/lib/crypto/signal-service";
import { AttachmentStore } from "@/lib/db/attachment-store";
import { ConversationStore } from "@/lib/db/conversation-store";
import { CryptoKeyStore } from "@/lib/db/crypto-key-store";
import { sqlCipherDatabase } from "@/lib/db/database";
import { DraftStore } from "@/lib/db/draft-store";
import { IdentityStore } from "@/lib/db/identity-store";
import { kekManager } from "@/lib/db/kek-manager";
import { MessageStore } from "@/lib/db/message-store";
import { OutboxStore } from "@/lib/db/outbox-store";
import { EnvelopeQuarantineStore } from "@/lib/db/envelope-quarantine-store";
import { EnvelopeAttemptStore } from "@/lib/db/envelope-attempt-store";
import { ReactionStore } from "@/lib/db/reaction-store";
import { ProfileStore } from "@/lib/db/profile-store";
import { SessionStore } from "@/lib/db/session-store";
import { MediaTransferService } from "@/lib/media/media-transfer";
import { MediaBlobCacheStore } from "@/lib/media/media-blob-cache";
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
const sessionResetApi = new SessionResetApi(apiClient);
const usersApi = new UsersApi(apiClient);
const envelopeQuarantineStore = new EnvelopeQuarantineStore(sqlCipherDatabase);
const envelopeAttemptStore = new EnvelopeAttemptStore(sqlCipherDatabase);
const messageStore = new MessageStore(sqlCipherDatabase);
const outboxStore = new OutboxStore(sqlCipherDatabase);
const mediaBlobCache = new MediaBlobCacheStore(sqlCipherDatabase);
const reactionStore = new ReactionStore(sqlCipherDatabase);
const conversationStore = new ConversationStore(sqlCipherDatabase);
const attachmentStore = new AttachmentStore(sqlCipherDatabase);
const attachmentsApi = new AttachmentsApi(apiClient);
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
  sessionStore,
);
const mediaTransferRef: { current: MediaTransferService | null } = { current: null };
const syncService = new SyncService(
  messagesApi,
  signalr,
  signalService,
  messageStore,
  conversationStore,
  identityStore,
  authStore,
  reactionStore,
  null,
  {
    quarantineStore: envelopeQuarantineStore,
    attemptStore: envelopeAttemptStore,
    sessionResetApi,
    sessionStore,
    outboxStore,
    mediaBlobCache,
    deviceDirectory: {
      listPeerDevices: async (userId) => usersApi.listDevices(userId),
      listOwnDevices: async () => devicesApi.listMyDevices(),
    },
    attachmentExists: async (attachmentId) => {
      try {
        await attachmentsApi.getStatus(attachmentId);
        return true;
      } catch {
        return false;
      }
    },
    reuploadMediaBlob: async (params) => {
      if (!mediaTransferRef.current) {
        throw new Error("Media transfer not ready");
      }
      return mediaTransferRef.current.reuploadFromCachedCiphertext(params);
    },
    resolveUsername: async (userId) => {
      try {
        const profile = await usersApi.getProfile(userId);
        return profile.username;
      } catch {
        return null;
      }
    },
  },
);
const mediaTransfer = new MediaTransferService(
  attachmentsApi,
  messageStore,
  attachmentStore,
  conversationStore,
  identityStore,
  (conversation, plaintext) => syncService.encryptAndPost(conversation, plaintext),
  undefined,
  { outboxStore, mediaBlobCache },
);
mediaTransferRef.current = mediaTransfer;
syncService.setMediaTransfer(mediaTransfer);

export const appServices = {
  authStore,
  appLockStore,
  kekManager,
  db: sqlCipherDatabase,
  apiClient,
  authApi: new AuthApi(apiClient),
  devicesApi,
  messagesApi,
  usersApi,
  signalr,
  identityStore,
  cryptoKeyStore,
  profileStore: new ProfileStore(sqlCipherDatabase),
  draftStore: new DraftStore(sqlCipherDatabase),
  sessionStore,
  messageStore,
  outboxStore,
  mediaBlobCache,
  reactionStore,
  conversationStore,
  envelopeQuarantineStore,
  envelopeAttemptStore,
  sessionResetApi,
  attachmentStore,
  attachmentsApi,
  mediaTransfer,
  crypto,
  preKeyManager,
  signalService,
  syncService,
};

export type AppServices = typeof appServices;
