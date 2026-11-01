# gdot-chat — Pre-Implementation Architecture Audit

Read-only inspection of the repository for adding fully E2EE voice/video/large-file messaging.

No code was modified during the audit. No packages were installed. No services were started.

**Date:** 2026-08-18

**Product goal under evaluation:** 1:1 E2EE chat (Expo / React Native client, ASP.NET Core 8 relay). Existing text E2EE uses Signal Protocol / Double Ratchet. Intended media path: encrypt on device → upload opaque ciphertext via API → MinIO → recipient downloads → decrypt with a key that travels only inside a Signal-encrypted control message. Live calls are out of scope.

---

# PART 1 — Repository overview

| Area | Paths |
|---|---|
| **Backend** | `server/GdotChat.Api` (ASP.NET Core 8 host), `server/GdotChat.Application`, `server/GdotChat.Domain`, `server/GdotChat.Infrastructure`, `server/GdotChat.Tests`. Solution: `server/GdotChat.slnx`. |
| **Frontend / mobile** | Expo 54 / React Native 0.81 app at repo root (`app/`, `components/`, `lib/`, `stores/`, `hooks/`). Package name in `package.json` is `smash`. |
| **Shared libraries** | No shared .NET/JS package. Client types are duplicated in `lib/api/api-types.ts`. Expo module stub: `modules/libsignal/` (native shells only; crypto is TypeScript). |
| **Database / migrations** | Server: EF Core + Npgsql, `server/GdotChat.Infrastructure/Migrations/`. Client: SQLCipher via `expo-sqlite` (`useSQLCipher: true` in `app.json`), migrations in `lib/db/migrations/`. |
| **Docker** | Only `server/docker-compose.yml` (Postgres 16). **No Dockerfiles, no API container, no reverse proxy.** |
| **Deployment** | Local: `mise.toml` tasks (`db`, `migrate`, `api`, `app`). EAS: `eas.json`. Kestrel URLs in `server/GdotChat.Api/Properties/launchSettings.json`. No nginx/Traefik/IIS/k8s/Terraform. |
| **Storage abstractions** | Server: PostgreSQL `bytea` on `message_envelopes.Ciphertext` only. **No S3/MinIO/blob/file abstraction.** Client: SQLCipher rows + Expo recorder/camera **file URIs**. `expo-file-system` is a transitive Expo dep and is **never imported**. |
| **Authentication** | Username/password + device pre-keys. JWT + rotating refresh tokens. `AuthController` / `AuthService` / `JwtTokenService`. |
| **Signal / E2EE** | Client-only: `@privacyresearch/libsignal-protocol-typescript@0.0.16`. Server stores public pre-keys and opaque ciphertext; it does not implement Signal. |
| **Message transport** | REST: `POST/GET/ACK /v1/messages`. Native clients poll (`ENABLE_SIGNALR` is web-only). SignalR hub `/hubs/messages` for envelope-available + reactions. |

---

# PART 2 — Backend architecture

## Authentication

**JWT generation** — `JwtTokenService.CreateAccessToken(User user, Device device)` (`server/GdotChat.Infrastructure/Security/JwtTokenService.cs` ~25–41):

- `sub` = `user.Id`
- `device_id` = `device.Id`
- `scope` = `"message:send message:read prekeys:write"` (issued, **never enforced**)
- HMAC-SHA256, issuer/audience from `JwtOptions`, expiry `AccessTokenMinutes` (15)

**JWT validation** — `Program.cs` ~50–77 `AddJwtBearer` with issuer, audience, signing key, 1-minute clock skew. Query-string `access_token` accepted only on `/hubs`.

**How an authenticated request gets `userId` / `deviceId`:**

`ClaimsPrincipalExtensions` in `server/GdotChat.Api/Extensions/ClaimsPrincipalExtensions.cs` (~7–20):

- `GetUserId()` reads `ClaimTypes.NameIdentifier` then `"sub"`, parses a `Guid`.
- `GetDeviceId()` reads `"device_id"`, parses a `Guid`. Missing claim throws `UnauthorizedAccessException` → HTTP 401.

`MessagesController` uses **only** `User.GetDeviceId()`. `ReactionsController` uses both. There are **no named authorization policies** — `AddAuthorization()` with default `[Authorize]` = any valid JWT. There is no user-only token; every access token is device-scoped.

**Refresh** — `AuthController.POST /v1/auth/refresh` (`AllowAnonymous`). `AuthService.RefreshAsync` hashes the plaintext (SHA-256 hex), looks up unrevoked non-expired row, revokes it, issues a new pair bound to the same device (`AuthService.cs` ~63–101). Access tokens are not denylisted.

**Login** requires an **existing** `deviceId` belonging to that user (`AuthService.LoginAsync` ~53–55). There is **no “add device to existing account” endpoint**. `RegisterDeviceWithPreKeysAsync` is only called from `RegisterAsync`.

**User vs device authorization:** device-level for messages/prekeys; user-level for search/profile/reactions identity check. Any authenticated device may send an envelope to any other active device (no conversation membership check).

## Controllers / endpoints

All JSON. `[ApiController]` supplies automatic 400 for invalid bodies. Errors go through `ExceptionHandlingMiddleware` as `{ error: string }`.

| Method | Route | Request | Response | Auth | Notes | Service |
|---|---|---|---|---|---|---|
| POST | `/v1/auth/register` | `RegisterRequest` | 201 `AuthResultDto` | Anonymous; rate `auth-register` 5/IP/hour | 409 username taken | `IAuthService.RegisterAsync` |
| POST | `/v1/auth/login` | `LoginRequest` | 200 `AuthResultDto` | Anonymous; rate `auth-login` 20/IP/hour | 401 bad creds/device | `LoginAsync` |
| POST | `/v1/auth/refresh` | `RefreshRequest` | 200 `AuthResultDto` | Anonymous; **no rate limit** | 401 invalid/revoked | `RefreshAsync` |
| GET | `/v1/users/search?q&limit` | query | 200 `UserSummaryDto[]` | JWT; rate `users-search` 30/user/min | prefix match, limit 1–30 | `IUserService.SearchByUsernameAsync` |
| GET | `/v1/users/{userId}` | — | 200 `UserSummaryDto` | JWT | 404 | `GetByIdAsync` |
| GET | `/v1/users/{userId}/devices` | — | 200 `DeviceSummaryDto[]` | JWT | active devices | `IDeviceService.ListDevicesForUserAsync` |
| GET | `/v1/users/{userId}/devices/{deviceId}/prekey-bundle` | — | 200 `PreKeyBundleDto` | JWT | consumes one OTK; 428 if exhausted; 404 | `GetPreKeyBundleAsync` |
| PUT | `/v1/devices/{deviceId}/prekeys` | `UploadPreKeysRequest` | 204 | JWT; **path deviceId must equal caller** | 403 mismatch | `UploadPreKeysAsync` |
| POST | `/v1/messages` | `SendMessageRequest` | 201 `SendMessageResponse` | JWT; rate `messages-send` 60/device/min | opaque relay | `IMessageRelayService.EnqueueAsync` |
| GET | `/v1/messages/pending?limit` | query, default 50 | 200 `MessageEnvelopeDto[]` | JWT | clamped 1–100; this device only | `GetPendingForDeviceAsync` |
| POST | `/v1/messages/{envelopeId}/ack` | — | 204 | JWT | 403 if not recipient; 404 | `AckAsync` |
| POST | `/v1/messages/reactions` | `ReactionRequest` | 204 | JWT | **not E2EE**; plaintext on server | `IReactionService.ToggleAndNotifyAsync` |
| SignalR | `/hubs/messages` | JWT via query | events `EnvelopeAvailable`, `PreKeysLow`, `ReceiveReaction`; hub method `SendReaction` | JWT; group `device:{deviceId}` | | `MessageRelayHub` / `SignalRMessageNotifier` |

### `POST /v1/messages` — can it stay unchanged for attachment control messages?

**Yes, for small Signal-encrypted JSON descriptors.** The server never inspects plaintext. `SendMessageRequest` (`server/GdotChat.Application/DTOs/MessageDtos.cs` ~3–7) is:

```csharp
public record SendMessageRequest(
    Guid RecipientUserId,
    Guid RecipientDeviceId,
    int MessageType,
    string CiphertextBase64);
```

`MessageType` is stored as `int` with **no validation** that it is 2 or 3. Ciphertext is `Convert.FromBase64String` → `bytea`.

**Do not put media bytes in this endpoint.** There is no streaming, no multipart, and the client JSON-stringifies the whole body (`lib/api/api-client.ts` ~540) with a **45s timeout**.

## Message persistence

Entity `MessageEnvelope` → table `message_envelopes`:

| Column | Type | Notes |
|---|---|---|
| `Id` | uuid PK | new Guid on enqueue |
| `SenderDeviceId` | uuid FK devices, Restrict | from JWT, **not** from body |
| `RecipientDeviceId` | uuid FK devices, Restrict | from request, must match `RecipientUserId` + active |
| `MessageType` | int | Signal type from client |
| `Ciphertext` | bytea NOT NULL | **no max length in EF config** |
| `CreatedAt` | timestamptz | |
| `ExpiresAt` | timestamptz | `now + Relay.EnvelopeTtlDays` (default **7**) |
| `DeliveredAt` | timestamptz nullable | **never written** |

Index: `(RecipientDeviceId, CreatedAt)`. Also `SenderDeviceId`.

**ACK:** recipient device only; **row deleted**. **TTL:** `EnvelopePurgeWorker` every hour calls `PurgeExpiredAsync` (`ExpiresAt < now`). Pending fetch does **not** delete or mark delivered.

**Hardcoded ciphertext max:** none in application code.

**Request/body limits:** none in this repo. No `MaxRequestBodySize`, `RequestSizeLimit`, `FormOptions`, Kestrel section, IIS, nginx, or Traefik. Framework default applies: Kestrel `MaxRequestBodySize` = **30,000,000 bytes**. Entire JSON body is buffered (`[FromBody]`).

---

# PART 3 — Signal / E2EE implementation

### A. Library

- Package: `@privacyresearch/libsignal-protocol-typescript` **0.0.16** (`package.json` / `package-lock.json`)
- Curve: `@privacyresearch/curve25519-typescript`
- Init: `ensureSignalInitialized()` → default export `libsignal()` (`lib/crypto/init-signal.ts`)
- Native module `modules/libsignal` is a **stub** (`isNativeShell` only). Crypto runs in Hermes JS.

Server enum (`SignalMessageType.cs`) names PreKey=2 and Whisper=3. Client decrypt treats **3 as PreKeyWhisperMessage** and **else as WhisperMessage** (`signal-engine.ts` ~183–187), which matches libsignal’s usual `WHISPER_TYPE=2`, `PREKEY_TYPE=3`. The server enum is unused in relay logic (stores the int). Treat the server names as misleading.

### B. Encryption API

Public façade: `SignalService` (`lib/crypto/signal-service.ts`)

- `encryptOutgoing(peerUserId, peerDeviceId, plaintext: string): Promise<SendPayload>`
- `decryptIncoming(senderUserId, messageType: 2 | 3, ciphertext: Uint8Array): Promise<string>`

`SendPayload`: `{ recipientUserId, recipientDeviceId, messageType, ciphertextBase64 }`.

Lower layers: `LibSignalAdapter` → `SignalEngine.encrypt/decrypt` → `SessionCipher.encrypt(utf8ToArrayBuffer(plaintext))`.

Session address is **peer user id**, not device GUID:

```ts
// lib/crypto/signal-service.ts ~12–14
function protocolAddressId(peerUserId: string): string {
  return peerUserId;
}
```

```ts
// lib/crypto/signal-engine.ts ~26–30
const DEVICE_ID = 1;

function addressFor(peerId: string): SignalProtocolAddress {
  return new SignalProtocolAddress(peerId, DEVICE_ID);
}
```

Associated data: none at app level. Replay of Signal ciphertext: Double Ratchet message keys; the app does not add extra anti-replay. Failed decrypts are **not ACK’d**, so the envelope is retried until TTL (`sync-service.ts` ~168–180).

`isTrustedIdentity` always returns `true` (`signal-protocol-store.ts` ~36–42). `saveIdentity` does not persist remote keys via `IdentityStore.saveRemoteIdentity` (no callers of `saveRemoteIdentity` outside the store itself).

### C. String-only plaintext?

**Yes, at the app API.** `ICryptoEngine.encrypt(peerAddressId, plaintext: string)` and decrypt returns `string`. Internally Signal already uses `ArrayBuffer`; UTF-8 encode/decode is in `buffer-utils.ts`.

Extending to a **small JSON control payload is easy**: put JSON in the existing `string` (no Signal library change). Extending to **arbitrary binary** needs changing `encrypt`/`decrypt`/`encryptOutgoing`/`decryptIncoming` to `Uint8Array` and skipping UTF-8. **Do not** put large media through Signal.

### D. Where keys are stored

SQLCipher DB `gdot.db` (`lib/db/constants.ts`). Passphrase = hex of 32 `expo-crypto.getRandomBytes` bytes, in `expo-secure-store` key `gdot.db.kek` with `requireAuthentication: true` (`kek-manager.ts`). Open: `PRAGMA key = '...'` (`database.native.ts` ~37–48).

| Material | Table |
|---|---|
| Identity public + user/device ids | `local_identity` |
| Identity **private** | `local_identity.identity_key_private` (migration 002) |
| Signed + one-time prekey pairs | `crypto_prekeys` |
| Sessions | `signal_sessions.session_blob` (UTF-8 of libsignal session JSON) |
| Remote identities | `remote_identities` (schema exists; not clearly populated) |

JWTs live in SecureStore (`lib/session/auth-store.ts`), not SQLCipher.

### E. Generic encrypted payload?

**No.** Server envelope is opaque bytes + Signal `MessageType` 2/3. Client always treats decrypted UTF-8 as chat text (`SyncService.pullPendingInner` inserts `plaintext`, preview `plaintext.slice(0, 120)`; `localMessageToUi` sets `kind: "text"`).

An attachment descriptor **can** be another Signal plaintext **if** the client parses a typed JSON schema after decrypt. The server does not need a new message type for that. `SyncService` **must** change so JSON descriptors are not shown as text.

### F. Multi-device routing

**One envelope to one recipient device.** `EnqueueAsync` writes a single row for `request.RecipientDeviceId`. No fan-out.

Client `startChatWithUser` picks **`devices[0]`** (`lib/chat/start-chat-with-user.ts` ~28–32). `conversations.peer_user_id` is UNIQUE — one conversation / one `peerDeviceId` per peer user.

Incoming lookup is `conversation.peerDeviceId === env.senderDeviceId`. Unknown sender → skip, **no ACK**, envelope sits until TTL.

There is no sender-device copy, no multi-device Signal addressing (hardcoded Signal device id `1`). MVP “don’t solve full media fan-out” matches current text behavior.

---

# PART 4 — Frontend architecture

| Concern | Location |
|---|---|
| Chat screen | `app/ChatRoom.tsx` |
| Persisted message model | `lib/db/types.ts` `LocalMessage` |
| UI message model | `stores/messages-store.ts` `Message` (`kind: text\|voice\|video\|story`) |
| Signal | `lib/crypto/signal-service.ts`, `signal-engine.ts`, `libsignal-adapter.ts` |
| Send/receive | `lib/session/sync-service.ts` `sendOutgoing` / `pullPending` |
| Poll | 30s (`SYNC_POLL_INTERVAL_MS` in `lib/config.ts`); also 5s local reload in `useConversationMessages` |
| SignalR | `lib/api/signalr-client.ts`; **`ENABLE_SIGNALR = Platform.OS === "web"`** |
| Voice record | `app/ChatRoom.tsx` `useAudioRecorder(RecordingPresets.HIGH_QUALITY)` |
| Video record | `components/video-message.tsx` `CameraView` `mode="video"` `recordAsync` |
| Playback | `components/voice-message-bubble.tsx` (`expo-audio`), `components/video-message-bubble.tsx` (`expo-video`) |
| Local files | recorder/camera **URIs only**; no `expo-file-system` usage |
| Permissions | `app.json` CAMERA, RECORD_AUDIO; runtime `requestRecordingPermissionsAsync`, `useCameraPermissions`, `useMicrophonePermissions` |
| Background | `shouldPlayInBackground: true` while recording; `experiments.supportsBackgroundPlayback`. No `expo-background-fetch` / TaskManager. Sync **stops when app locks** (`SyncProvider`). |

## Voice/video UI vs E2EE MVP gate

Exact string in `app/ChatRoom.tsx` (~433–437):

> Voice and video are not available in encrypted text mode (MVP).

Wired as:

- `onCycleSendEmpty={mediaNotAvailable}` on `ComposerFab` (~1085–1091)
- `finishVoiceCapture` / `finishVideoCapture` call `mediaNotAvailable()` then stop (~468–537)
- `composerMode` is **hardcoded** `const composerMode = "send" as const` (~163)
- `showVoiceRecordingMeter` / `showVideoRecordingMeter` are **false** (~826–827)
- `HoldRecordControls` is imported and a ref exists; **it is not rendered**
- Hold-to-record `PanResponder` only arms when mode is `voice` or `video` (~701–703), which never happens

So: full record/lock/cancel/preview code exists, but the composer cannot enter voice/video mode. Tapping the empty send FAB shows the MVP error.

**90s:** `VIDEO_RECORD_MAX_MS = 90_000` (`video-message.tsx` ~20), `recordAsync({ maxDuration: 90 })`, ChatRoom timeout (~613–619). **Voice has no max duration.**

**Formats (from APIs used; `node_modules/expo-audio` was not readable during the audit):**

- Voice: `RecordingPresets.HIGH_QUALITY` → Expo audio file URI (typically AAC/M4A on iOS/Android).
- Video: `CameraView.recordAsync` → `{ uri: string }` (typically `.mov`/`.mp4`). Facing `front`, mirrored.
- Represented as **file URIs**, not bytes. `VoiceMessageBubble` / `VideoMessageBubble` take `uri: string`.
- UI `Message` has `kind`, `mediaUri`, `durationMs`. That is **not** persisted in SQLCipher.
- `stores/media-store.ts`: preferences only (auto-download, quality). Dummy `StorageSummaryCard` hardcodes “12.4 GB used”.

Web: recording explicitly rejected (“not available on web”). Web SQLCipher stub throws (`database.web.ts`).

---

# PART 5 — Local database

Migration runner: `lib/db/migration-runner.ts`, versions 1–3, table `schema_migrations`.

**`messages` (001):**

```text
id TEXT PK
client_id TEXT UNIQUE
conversation_id TEXT FK
direction CHECK incoming|outgoing
plaintext TEXT NOT NULL
ciphertext BLOB nullable
message_type INTEGER  (Signal 2/3, not voice/video)
status TEXT  (pending|sent|delivered|failed)
sender_device_id TEXT
server_envelope_id TEXT  (no UNIQUE)
created_at INTEGER
```

**Not present:** attachment, file path, MIME, size, duration, upload/download state, media kind.

`LocalMessage` in `lib/db/types.ts` matches that. Ciphertext column is rarely filled by `SyncService` (inserts plaintext only).

**Conversations:** one row per `peer_user_id`, stores `peer_device_id`.

SQLCipher: `expo-sqlite` plugin `useSQLCipher: true`; `cipher_memory_security = ON`. App lock closes DB (`app-lock-provider.tsx`). No local media directory convention.

---

# PART 6 — Existing media/file infrastructure

| Term | What exists |
|---|---|
| upload | Pre-key JSON upload only (`DevicesApi.uploadPreKeys`) |
| download | Settings copy “Auto-download media”; no HTTP download of blobs |
| attachment / blob / S3 / MinIO / presigned / multipart / FormData | **None** |
| stream | **None** on API (`IFormFile`/streams absent) |
| expo-av | **Not used**; `expo-audio` + `expo-video` |
| expo-camera | `components/video-message.tsx` |
| expo-file-system / document picker / media library | **Not imported** |
| filesystem / cache | SQLCipher + ephemeral recorder URIs |
| Content-Type | JSON only (`application/json`) |
| `httpFetch` body type | **`string` only** (`lib/api/http-fetch.ts`) |

Reusable pieces: recording UI, playback bubbles, URI-based `Message.kind`, media **prefs** store. Missing: encrypt/upload/download/persist media.

---

# PART 7 — Deployment and infrastructure

`server/docker-compose.yml`: Postgres 16, port **5433→5432**, volume `pgdata`. That’s the only persistent disk in compose.

API runs on the **host** (`dotnet run`, binds `0.0.0.0:5066/5067`). HTTPS redirection **off** in Development. Dev CORS `AllowAnyOrigin`. Android `usesCleartextTraffic: false`. Logging: default ASP.NET. **No monitoring, backups, reverse proxy, or TLS terminator in-repo.**

`appsettings.json` / Development connection string use **port 5432**; compose publishes **5433**. README says 5433. Local wiring is inconsistent.

**MinIO without exposing it to phones:**

Easiest: add a `minio` service to `server/docker-compose.yml`, bind **`127.0.0.1:9000`** (API is on the host). Do not publish 9000 on `0.0.0.0`. Clients talk only to ASP.NET.

True `Internet → ASP.NET → private MinIO` needs the API **in the same Docker network** (no public MinIO ports). That is **not** the current layout (API is not containerized). Architecturally fine; compose must change.

API process itself has no app volume. Postgres `pgdata` is the only declared persistence.

---

# PART 8 — Rate limits and large uploads

| Limit | Value |
|---|---|
| Register | 5 / IP / hour |
| Login | 20 / IP / hour |
| Send message | 60 / `device_id` / minute |
| User search | 30 / `sub` / minute |
| Refresh | none |
| Prekey / pending / ack | none |
| Client HTTP timeout | **45s** (`REQUEST_TIMEOUT_MS`) |
| Refresh timeout | 15s |
| Kestrel body (unconfigured) | **~30 MB** |
| Cancellation | `AbortController` on pending GET; send has no upload abort API |
| Quotas | none |
| Background jobs | envelope purge hourly |

If a client tried to PUT a huge file **through current APIs** (JSON `POST /v1/messages`):

| Size | Likely outcome |
|---|---|
| **10 MB** ciphertext | Base64 ~13.3 MB JSON; under 30 MB. May succeed if it finishes in 45s. Postgres can store it. Pending GET would return a huge JSON payload. |
| **100 MB** | Exceeds Kestrel 30 MB → **413**. Client timeout likely first. |
| **500 MB / 1 GB** | Same; plus XHR/`JSON.stringify` memory. |

There is **no** chunked/resumable upload path today.

---

# PART 9 — Security review of the proposed media architecture

Proposed path: random media key + client-side authenticated encryption + encrypted chunks + temporary MinIO + Signal-encrypted attachment descriptor.

1. **Key generation:** `expo-crypto.getRandomBytes` is already used for the DB KEK. `randomUUID` via `expo-crypto`. Suitable for a per-file media key.
2. **Crypto libraries installed:** libsignal + `expo-crypto` (hash/random/UUID). **No AES-GCM library.**
3. **Secure random:** yes, `getRandomBytes(32)`.
4. **AES-GCM:** **not present.** `expo-crypto` does not expose AES-GCM. No `@noble/ciphers`, `react-native-quick-crypto`, or SubtleCrypto usage. **Needs a new, maintained primitive.**
5. **Streaming/chunked encryption:** none.
6. **Trust:** libsignal 0.0.16 is GPL-3.0, low version, JS-on-Hermes. Fine for current Signal; **do not** stretch it into media AEAD. Pick a dedicated AEAD library.
7. **RN/native limits:** New Architecture on; libsignal native is a stub; large `Uint8Array` in JS will OOM on big videos.
8. **Encrypt without full-file RAM:** not supported now. Need file-backed chunk I/O (`expo-file-system` or similar) + chunk AEAD. Recorders already produce files; that helps.
9. **Backend stream without buffering:** current stack **cannot**. New endpoints must use streams/`IFormFile`/multipart or chunk APIs, raise body limits, and **not** `[FromBody]` JSON.
10. **MinIO only via ASP.NET:** feasible if MinIO is localhost/internal and credentials stay on the server. Not true until compose/network is set that way.
11. **Authz vs device ids:** JWT `device_id` is enough to bind objects to `senderDeviceId` / `recipientDeviceId`, same as envelopes. Need a **metadata table** (not only MinIO keys). UUID object ids are not a capability; always check JWT device.
12. **Delete after download:** envelope ACK is the pattern. Need object lifecycle + TTL worker analogous to `EnvelopePurgeWorker`. ACK-then-delete races if decrypt/download fails (today, failed decrypt never ACKs).
13. **JWT:** device-scoped tokens are sufficient **if** every media route uses `GetDeviceId()` and compares to stored sender/recipient. Unused `scope` claim should not be relied on. Refresh is not rate-limited.
14. **Replay / substitution / confused deputy:** anyone with a JWT can enqueue to any device. Same risk for “create attachment then send descriptor.” Bind upload session → creator device; bind download → recipient (and maybe sender retry); bind descriptor `attachmentId` + size + chunk count + content hash **inside Signal plaintext** so the server cannot swap objects. Pending envelopes from unknown senders are left un-acked (DoS/TTL park).
15. **Opaque public ids:** Guid envelope ids are already public-to-the-recipient. Same model is OK if every GET is authz-checked. Don’t log ids with keys. Don’t put keys in URLs.
16. **Unavoidable metadata:** size, timestamps, sender/recipient device ids, duration if you store it, IP at upload. `MessageRelayService` already logs ciphertext **length**. Reactions are plaintext. Pre-key fetches are observable.

**Hermes TextDecoder polyfill** (`lib/polyfills.ts`) exists for libsignal, not for AES.

---

# PART 10 — Protocol constraints vs current code

| Constraint | Fit |
|---|---|
| AES-256-GCM | New client crypto dependency |
| Per-file random key inside Signal | Compatible with `encryptOutgoing(string)` if descriptor is JSON |
| Unique nonce per chunk | New |
| Chunked up/down | New API + client HTTP (body is string-only, 45s timeout) |
| Resumable | New; nothing to extend |
| Signal descriptor | Control plane OK; `SyncService` must learn types |
| Temporary MinIO | New infra; compose only has Postgres |
| Delete after retrieval | New; copy envelope ACK pattern |
| TTL cleanup | Copy `EnvelopePurgeWorker` |
| Device-scoped authz | JWT already device-scoped |
| No live calls | Matches repo |
| No server transcode/decrypt/key storage | Matches honest-relay model |
| No permanent media | Need explicit TTL; Postgres envelopes already TTL |

**Change before implementation (necessary, not drive-by):**

1. Client plaintext protocol (typed JSON) so media descriptors aren’t shown as chat text.
2. Local `messages` schema: kind, mime, size, duration, local path, remote object id, transfer state.
3. New media upload/download APIs — **do not** overload `POST /v1/messages` with file bytes.
4. AES-GCM (or equivalent AEAD) library + chunked file I/O.
5. MinIO + API network binding.
6. HTTP client: binary/stream, longer timeouts, cancellation.
7. Kestrel/proxy body and timeout config for the new routes only.

Do **not** redesign text envelopes unless you also fix failed-decrypt retry/ACK behavior when adding a second payload type.

---

# PART 11 — Summary for the implementation architect

## A. Current Architecture Summary

```text
UI (ChatRoom sendTextMessage)
  → SyncService.sendOutgoing(conversationId, text)
      optimistic LocalMessage status=pending in SQLCipher
      abort pending GET; pause SignalR if connected
      → SignalService.encryptOutgoing(peerUserId, peerDeviceId, text)
          ensureSession: if none, GET prekey-bundle (consumes OTK)
          SessionCipher.encrypt(UTF-8) → { ciphertext, type 2|3 }
      → MessagesApi.send JSON { recipientUserId, recipientDeviceId, messageType, ciphertextBase64 }
  → MessagesController.SendAsync
      senderDeviceId = JWT device_id
      MessageRelayService.EnqueueAsync → message_envelopes row, TTL 7d
      SignalR EnvelopeAvailable to group device:{recipient}
  → Recipient: poll GET /v1/messages/pending every 30s (native) or SignalR+poll (web)
      decryptIncoming(peerUserId, type, bytes) → UTF-8 string
      insert LocalMessage plaintext, bump preview/unread
      POST /v1/messages/{id}/ack → DELETE row
  → ChatRoom maps via localMessageToUi as kind:"text"
```

Server never sees plaintext. Identity private keys never leave the device DB.

## B. Relevant Files

**Backend:** `Program.cs`, `ClaimsPrincipalExtensions.cs`, `JwtTokenService.cs`, `AuthService.cs`, `MessagesController.cs`, `MessageRelayService.cs`, `MessageEnvelope.cs`, `MessageEnvelopeConfiguration.cs`, `DeviceService.cs`, `EnvelopePurgeWorker.cs`, `MessageRelayHub.cs`, `ExceptionHandlingMiddleware.cs`, `docker-compose.yml`, `appsettings.json`.

**Signal:** `lib/crypto/signal-service.ts`, `signal-engine.ts`, `libsignal-adapter.ts`, `signal-protocol-store.ts`, `pre-key-manager.ts`, `init-signal.ts`, `lib/auth/registration.ts`.

**Transport:** `lib/session/sync-service.ts`, `lib/api/messages-api.ts`, `api-client.ts`, `http-fetch.ts`, `signalr-client.ts`, `lib/config.ts`.

**Local DB:** `database.native.ts`, `kek-manager.ts`, `migrations/001-initial.ts`, `002-key-material.ts`, `message-store.ts`, `types.ts`.

**Media UI:** `app/ChatRoom.tsx`, `components/video-message.tsx`, `voice-message-bubble.tsx`, `video-message-bubble.tsx`, `hold-record-controls.tsx`, `stores/media-store.ts`, `stores/messages-store.ts`.

## C. Existing APIs

See the endpoint table in Part 2. Media: **none**.

## D. Signal Implementation

- Package `@privacyresearch/libsignal-protocol-typescript@0.0.16`
- `KeyHelper`, `SessionBuilder`, `SessionCipher`, `SignalProtocolAddress`, `FingerprintGenerator`
- `SignalEngine` / `LibSignalAdapter` / `SignalProtocolStore` / `PreKeyManager` / `SignalService`
- Server: public identity + signed prekey + OTKs on `devices` / `signed_pre_keys` / `one_time_pre_keys`; `FOR UPDATE SKIP LOCKED` consume

## E. Frontend Media Implementation

- Gate: `ChatRoom.mediaNotAvailable` (~433)
- Voice: `useAudioRecorder(RecordingPresets.HIGH_QUALITY)`, `startVoiceRecording` / `finishVoiceCapture` / `discardVoiceRecording`
- Video: `VideoMessage` ref `startRecording`/`stopRecording` → `{ uri }`
- Playback: `VoiceMessageBubble`, `VideoMessageBubble`
- Hold/lock/cancel: implemented but **unreachable** (composer locked to `"send"`)
- No send path into `SyncService` for media

## F. Database Schema

**Server `message_envelopes`:** Id, SenderDeviceId, RecipientDeviceId, MessageType, Ciphertext bytea, CreatedAt, ExpiresAt, DeliveredAt (unused).

**Client `messages`:** plaintext TEXT + optional Signal ciphertext blob + status; **no media columns**.

Also: users, devices, prekeys, refresh_tokens, message_reactions (plaintext).

## G. Infrastructure

Postgres in Docker (`pgdata`). API on host Kestrel 5066/5067. No proxy, no MinIO, no API Dockerfile. Persistent disk = Postgres volume only.

## H. Proposed Media Architecture Compatibility

| Component | Verdict |
|---|---|
| AES-GCM client encryption | **Needs new subsystem** (no AEAD library) |
| Chunking | **Needs new subsystem** |
| Resumable upload | **Needs new subsystem** |
| MinIO | **Needs new subsystem** (compose + API client) |
| Temporary storage | **Needs new subsystem** (envelopes are not suitable for large blobs) |
| Signal attachment descriptor | **Needs modification** (client parse/dispatch); server `POST /v1/messages` **Compatible** for small ciphertext |
| Device-scoped download authz | **Compatible** with JWT `device_id`; **needs new** media metadata + checks |
| Delete-after-download | **Needs new subsystem** (pattern exists for envelopes) |
| TTL cleanup | **Compatible** pattern (`EnvelopePurgeWorker`); new job for objects |

**Potential problems:** 45s JSON HTTP client; 30 MB Kestrel default; JS RAM; Signal sessions keyed by user id not device; unknown-sender envelopes never ACK’d; `SyncService` assumes all plaintext is chat; no second-device API; failed decrypt retry loop.

## I. Questions / Unknowns

- Exact on-device codec/container for `RecordingPresets.HIGH_QUALITY` and `CameraView.recordAsync` (Expo packages not readable in this workspace).
- Whether Hermes `crypto.subtle` exists in this build (unused; cannot be assumed).
- Production TLS, reverse proxy, and whether the API will be containerized.
- Intended Postgres port (5432 vs 5433).
- Whether `DeliveredAt` was planned and abandoned.
- Whether `scope` claims were meant to become policies.
- Safety-number / remote-identity persistence appears incomplete (`saveRemoteIdentity` unused).
- libsignal `encrypt().body` ArrayBuffer vs binary-string handling in production.
- Max video size for “large recorded videos” and Wi-Fi-only auto-download policy enforcement (prefs exist, no network check).

## J. Recommended Implementation Order

1. **Client message schema + typed Signal plaintext** (e.g. `{ v, t: "text"|"voice"|"video"|"file", ... }`) and `SyncService` dispatch — so descriptors never render as chat.
2. **SQLCipher migration** for media fields and local file layout (ciphertext files, not plaintext cache long-term).
3. **Choose and integrate AEAD** (AES-256-GCM) + `getRandomBytes` media keys; prove encrypt/decrypt on a small fixture.
4. **Chunked file encryption** from recorder URIs without full-file RAM.
5. **MinIO in compose**, bound so only the API can reach it; API MinIO client.
6. **New ASP.NET media routes** (create object, chunk PUT, GET stream, delete) with `GetDeviceId()` authz and metadata table; raise limits/timeouts **on those routes only**.
7. **Client upload/download** (extend `httpFetch` beyond `string`, progress, cancel, resume).
8. **Send path:** encrypt file → upload ciphertext → `encryptOutgoing(JSON descriptor)` → existing `POST /v1/messages`.
9. **Receive path:** decrypt descriptor → authorize download → decrypt chunks to file → playback URI; ACK envelope after descriptor handled; delete object after successful recipient retrieval (define sender retry).
10. **TTL worker** for orphan objects; align with envelope 7-day TTL.
11. **Re-enable composer** (remove MVP gate, render `HoldRecordControls`, persist `kind`/`mediaUri`).
12. **Keep multi-device fan-out out of MVP**; document `devices[0]` + Signal address `userId.1`.

Do not implement live calls, server transcoding, or putting media keys in Postgres/MinIO.

---

```text
AUDIT COMPLETE
```

## The 15 most important facts before writing the implementation plan

1. Server is an opaque device-to-device envelope relay; JWT `device_id` is the authorization primitive.
2. `POST /v1/messages` can carry a Signal-encrypted attachment descriptor; it cannot carry large media.
3. Native clients **poll** pending envelopes every 30s; SignalR is **web-only**.
4. Signal plaintext API is **strings**; JSON descriptors are the low-disruption path.
5. Sessions are addressed as **`peerUserId` + Signal device 1**, and chats bind **one** `peerDeviceId` (`devices[0]`).
6. There is **no add-device** API; register creates a user+device pair.
7. SQLCipher `messages.plaintext` is the only persisted body; **no media columns**.
8. Voice/video **UI and recorders exist** but are gated by `mediaNotAvailable`; hold-to-record is not mounted.
9. Media exists as **Expo file URIs**; `expo-file-system` is unused; no AES-GCM library.
10. **No MinIO/S3/multipart/streaming**; compose is Postgres only; API is not in Docker.
11. Unconfigured Kestrel **~30 MB** body cap; client **45s** timeout; send rate **60/device/min**.
12. Envelope ACK **deletes** the row; failed decrypt **does not ACK** (retry until 7-day TTL).
13. Reactions are **not E2EE** (server-visible); don’t copy that for media keys.
14. `httpFetch` only sends **JSON strings** — binary upload needs a new client transport.
15. Identity private keys are in SQLCipher behind biometric SecureStore KEK; keep media keys in the Signal payload only.
