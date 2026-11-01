# Gdot Chat Server

ASP.NET Core 8 ciphertext relay API compatible with the Expo client (`lib/api/`).

## Prerequisites

- [.NET 8 SDK](https://dotnet.microsoft.com/download)
- [Docker](https://www.docker.com/) (for PostgreSQL and integration tests)


## JWT signing key

The API **does not** store `Jwt:SigningKey` in `appsettings.json`. Provide it via environment or user-secrets (32+ characters):

```powershell
# Environment (PowerShell)
$env:Jwt__SigningKey = "paste-a-long-random-secret-at-least-32-chars"

# Or .NET user-secrets (Development)
dotnet user-secrets set "Jwt:SigningKey" "paste-a-long-random-secret-at-least-32-chars" --project GdotChat.Api
```

Docker / compose: set `Jwt__SigningKey` in the API service environment.

**Local Development shortcut:** `appsettings.Development.json` may set `Jwt:UseEphemeralDevelopmentSigningKey` to `true`. That enables a fixed in-process ephemeral key defined only in code — never use that flag in staging/production.

Startup **fails fast** if the signing key is missing or shorter than 32 characters (except Testing, which uses a test key, and Development with the ephemeral flag).

SignalR WebSocket clients still send the JWT as `?access_token=` (browser/RN limitation). The server accepts that query value **only** on `/hubs/*`, moves it into `HttpContext.Items`, and strips it from the query string before request logging so the token is not written to access logs. Prefer `accessTokenFactory` on the client (already used) so LongPolling/SSE can use the Authorization header when the transport allows it.

## Quick start

```powershell
cd server
docker compose up -d
dotnet ef database update -p GdotChat.Infrastructure -s GdotChat.Api
dotnet run --project GdotChat.Api
```

- Swagger: https://localhost:5067/swagger
- REST base: `https://localhost:5067/v1`
- SignalR hub: `https://localhost:5067/hubs/messages`

The API binds to `0.0.0.0` so it is reachable on your LAN IP (e.g. `http://192.168.x.x:5066/swagger`). Restart the server after changing `launchSettings.json`.

PostgreSQL is exposed on **port 5433** (avoids conflict with a local Postgres on 5432).

MinIO is bound to **127.0.0.1:9000** (S3 API) and **127.0.0.1:9001** (console). Mobile clients never talk to MinIO. The API reads:

| Key | Purpose |
|-----|---------|
| `Minio:Endpoint` | `127.0.0.1:9000` |
| `Minio:AccessKey` / `Minio:SecretKey` | local credentials from env / `appsettings.json` |
| `Minio:Bucket` | `gdot-attachments` |
| `Minio:UseServerSideEncryption` | `false` locally; enable with KMS in production |
| `Attachments:MaxSizeBytes` | default 1 GiB |
| `Attachments:ChunkSizeBytes` | default 4 MiB |
| `Attachments:TtlDays` | default 7 |

Override secrets with environment variables (`Minio__AccessKey`, `Minio__SecretKey`, `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`). Do not expose MinIO ports on `0.0.0.0`.

Default connection string (see `GdotChat.Api/appsettings.json`):

`Host=localhost;Port=5433;Database=gdotchat;Username=gdot;Password=gdot_dev`

## Client configuration

Set the Expo env var to reach the API from a device or emulator:

| Target | `EXPO_PUBLIC_API_URL` |
|--------|------------------------|
| iOS simulator / desktop | `https://localhost:5067/v1` |
| Android emulator | `http://10.0.2.2:5066/v1` (HTTP) or HTTPS with dev cert |
| Physical device | `https://<LAN-IP>:5067/v1` |

SignalR URL is derived automatically in `lib/config.ts` from the API base URL.

## Integration tests

```powershell
cd server
dotnet test
```

Tests use Testcontainers with the local `postgres:15` image when available. To use an external database instead:

```powershell
$env:GDOT_INTEGRATION_PG = "Host=localhost;Port=5432;Database=gdotchat_test;Username=...;Password=..."
dotnet test
```

## Solution layout

- `GdotChat.Api` — controllers, `Program.cs`, middleware
- `GdotChat.Application` — services, DTOs, interfaces
- `GdotChat.Domain` — entities, exceptions
- `GdotChat.Infrastructure` — EF Core, JWT, SignalR, background workers
- `GdotChat.Tests` — integration tests

## Manual E2E checklist (T1/T2)

1. Start server and PostgreSQL (above).
2. Register user A and user B on two clients.
3. A searches for B, fetches pre-key bundle, sends an encrypted message.
4. B receives `EnvelopeAvailable` on SignalR, pulls `/v1/messages/pending`, decrypts, acks.
5. Confirm in PostgreSQL: `message_envelopes` row is removed after ack; `ciphertext` is opaque bytes only.
