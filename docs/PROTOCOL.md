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

## Running the server

```powershell
cd server
docker compose up -d
dotnet run --project GdotChat.Api
```

Details: [server/README.md](../server/README.md).
