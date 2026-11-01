# Protocol summary

See [e2ee_sqlcipher_spec plan](../.cursor/plans/e2ee_sqlcipher_spec_e374ce9a.plan.md) for full REST, SignalR, PostgreSQL, and SQLCipher schemas.

## Server endpoints (dev)

| Surface | URL |
|---------|-----|
| REST base | `https://localhost:5067/v1` |
| REST (HTTP) | `http://localhost:5066/v1` |
| SignalR hub | `https://localhost:5067/hubs/messages` |

Hub JWT: WebSockets use query param `access_token` (redacted server-side on `/hubs/*` only; see `lib/api/signalr-client.ts`). Prefer `accessTokenFactory` so non-WS transports can use the Authorization header.

## Client env

```bash
# Physical device on LAN
EXPO_PUBLIC_API_URL=https://192.168.x.x:5067/v1

# Android emulator (HTTP avoids dev cert setup)
EXPO_PUBLIC_API_URL=http://10.0.2.2:5066/v1
```

## REST (v1)

- `POST /auth/register`, `/login`, `/refresh`
- `GET /users/search?q=`, `/users/{userId}`, `/users/{userId}/devices`
- `GET /users/{userId}/devices/{deviceId}/prekey-bundle` (428 when OTK exhausted)
- `PUT /devices/{deviceId}/prekeys`
- `POST /messages` → `{ envelopeId }`
- `GET /messages/pending?limit=50`
- `POST /messages/{envelopeId}/ack`
- `POST /attachments` → `{ attachmentId, chunkSizeBytes, chunkCount, expiresAt }`
- `PUT /attachments/{id}/chunks/{index}` (raw `application/octet-stream`)
- `GET /attachments/{id}`
- `POST /attachments/{id}/complete`
- `GET /attachments/{id}/chunks/{index}` (raw ciphertext)
- `POST /attachments/{id}/download-complete`
- `DELETE /attachments/{id}`

Decrypted Signal payloads are versioned JSON (`v=1`, `t=text|media|reaction`). Legacy plaintext strings remain valid text. Media bytes never go through `/messages`. See [e2ee-media.md](./e2ee-media.md).

### Reaction payload (E2EE)

Reactions are **not** stored or pushed in plaintext by the server. They are ordinary Signal envelopes whose plaintext is:

```json
{
  "v": 1,
  "t": "reaction",
  "op": "add" | "remove",
  "targetServerEnvelopeId": "<uuid of the reacted message envelope>",
  "emoji": "👍"
}
```

Clients resolve `targetServerEnvelopeId` to a local message and update the local `message_reactions` SQLCipher table. There is no `/v1/messages/reactions` REST endpoint and no SignalR `ReceiveReaction` / hub `SendReaction`.

## SignalR (server → client)

- `EnvelopeAvailable` — `{ envelopeId: string }`
- `PreKeysLow` — `{ remainingCount: number }`

## Local storage

- `gdot.db` via `expo-sqlite` + `useSQLCipher: true`, `PRAGMA key` from KEK
- Composer drafts and profile fields: SQLCipher (`composer_drafts`, `local_profile`) — not AsyncStorage
- **MVP client crypto:** `@privacyresearch/libsignal-protocol-typescript` on Hermes via `lib/crypto/signal-engine.ts`
- **Hermes polyfill:** `index.ts` → `lib/polyfills.ts` (`@borewit/text-codec`) — required on iOS/Android for `utf-16le` TextDecoder support
- **Native libsignal** (`LibSignalClient` / Rust core): **deferred**; not required for T2 MVP
- Pre-key upload: `PUT /v1/devices/{deviceId}/prekeys` on sync start and when replenishing

## SignalR security note

WebSocket hub connections still carry JWT as `?access_token=` (transport limitation). The API accepts that query param **only** under `/hubs`, then redacts it from the request query before logging. Use TLS, short-lived access tokens, and rotate on suspicion. See [THREAT_MODEL.md](./THREAT_MODEL.md).

## Threat model

See [THREAT_MODEL.md](./THREAT_MODEL.md).

## Running the server

```powershell
cd server
docker compose up -d
dotnet run --project GdotChat.Api
```

Details: [server/README.md](../server/README.md).
