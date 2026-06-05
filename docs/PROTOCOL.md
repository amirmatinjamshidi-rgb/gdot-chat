# Protocol summary

See [e2ee_sqlcipher_spec plan](../.cursor/plans/e2ee_sqlcipher_spec_e374ce9a.plan.md) for full REST, SignalR, PostgreSQL, and SQLCipher schemas.

## Server endpoints (dev)

| Surface | URL |
|---------|-----|
| REST base | `https://localhost:5067/v1` |
| REST (HTTP) | `http://localhost:5066/v1` |
| SignalR hub | `https://localhost:5067/hubs/messages` |

Hub JWT: query param `access_token` (see `lib/api/signalr-client.ts`).

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

## SignalR (server → client)

- `EnvelopeAvailable` — `{ envelopeId: string }`
- `PreKeysLow` — `{ remainingCount: number }`

## Local storage

- `gdot.db` via `expo-sqlite` + `useSQLCipher: true`, `PRAGMA key` from KEK
- Composer drafts and profile fields: SQLCipher (`composer_drafts`, `local_profile`) — not AsyncStorage
- Signal Protocol: `@privacyresearch/libsignal-protocol-typescript` via `lib/crypto/signal-engine.ts` and `modules/libsignal/`
- Pre-key upload: `PUT /v1/devices/{deviceId}/prekeys` on sync start and when replenishing

## SignalR security note

The hub uses `?access_token=` for JWT (see `lib/api/signalr-client.ts`). Reverse proxies and access logs may capture this value; rotate tokens and use TLS in production.

## Threat model

See [THREAT_MODEL.md](./THREAT_MODEL.md).

## Running the server

```powershell
cd server
docker compose up -d
dotnet run --project GdotChat.Api
```

Details: [server/README.md](../server/README.md).
