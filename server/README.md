# Gdot Chat Server

ASP.NET Core 8 ciphertext relay API compatible with the Expo client (`lib/api/`).

## Prerequisites

- [.NET 8 SDK](https://dotnet.microsoft.com/download)
- [Docker](https://www.docker.com/) (for PostgreSQL and integration tests)

## Secrets (do not commit)

The API **does not** store database passwords, MinIO keys, or `Jwt:SigningKey` in committed `appsettings*.json`.

Provide them via environment variables or .NET user-secrets:

```powershell
# PostgreSQL (full connection string including Password=)
$env:ConnectionStrings__Default = "Host=localhost;Port=5433;Database=gdotchat;Username=gdot;Password=YOUR_DB_PASSWORD"

# MinIO
$env:Minio__AccessKey = "YOUR_MINIO_ACCESS_KEY"
$env:Minio__SecretKey = "YOUR_MINIO_SECRET_KEY"

# JWT (32+ characters)
$env:Jwt__SigningKey = "paste-a-long-random-secret-at-least-32-chars"

# Or user-secrets (Development)
dotnet user-secrets set "ConnectionStrings:Default" "Host=localhost;Port=5433;Database=gdotchat;Username=gdot;Password=YOUR_DB_PASSWORD" --project GdotChat.Api
dotnet user-secrets set "Minio:AccessKey" "YOUR_MINIO_ACCESS_KEY" --project GdotChat.Api
dotnet user-secrets set "Minio:SecretKey" "YOUR_MINIO_SECRET_KEY" --project GdotChat.Api
dotnet user-secrets set "Jwt:SigningKey" "paste-a-long-random-secret-at-least-32-chars" --project GdotChat.Api
```

Docker / compose: set the same variables on the API service. Compose may still define local-only defaults for the Postgres/MinIO *containers* — change those for any shared or exposed environment.

Startup **fails fast** if:

- `ConnectionStrings:Default` is missing or has an empty `Password` (except Testing)
- `Minio:AccessKey` / `Minio:SecretKey` are missing (except Testing, which uses in-memory attachment storage)
- `Jwt:SigningKey` is missing or shorter than 32 characters (except Testing, and Development with the ephemeral flag)

**Local Development JWT shortcut:** `appsettings.Development.json` may set `Jwt:UseEphemeralDevelopmentSigningKey` to `true`. That enables a fixed in-process ephemeral key defined only in code — never use that flag in staging/production.

SignalR WebSocket clients still send the JWT as `?access_token=` (browser/RN limitation). The server accepts that query value **only** on `/hubs/*`, moves it into `HttpContext.Items`, and strips it from the query string before request logging so the token is not written to access logs. Prefer `accessTokenFactory` on the client (already used) so LongPolling/SSE can use the Authorization header when the transport allows it.

## Rate limits

Configurable under `RateLimits` in config / env (`RateLimits__AuthRefreshPermitLimit`, etc.). Integration tests set high limits by default; dedicated rate-limit tests override them.

## Quick start

```powershell
cd server
docker compose up -d
# Set ConnectionStrings__Default, Minio__*, Jwt__SigningKey (see above)
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
| `Minio:AccessKey` / `Minio:SecretKey` | from env / user-secrets only |
| `Minio:Bucket` | `gdot-attachments` |
| `Minio:UseServerSideEncryption` | `false` locally; enable with KMS in production |
| `Attachments:MaxSizeBytes` | default 1 GiB |
| `Attachments:ChunkSizeBytes` | default 4 MiB |
| `Attachments:TtlDays` | default 7 |

Do not expose MinIO ports on `0.0.0.0`.

## Client configuration

Set the Expo env var (see root `.env.example`) to reach the API from a device or emulator:

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
- `GdotChat.Tests` — integration / E2E-style API tests

## Manual E2E checklist (T1/T2)

1. Start server and PostgreSQL (above).
2. Register user A and user B on two clients.
3. A searches for B, fetches pre-key bundle, sends an encrypted message.
4. B receives `EnvelopeAvailable` on SignalR, pulls `/v1/messages/pending`, decrypts, acks.
5. Confirm in PostgreSQL: `message_envelopes` row is removed after ack; `ciphertext` is opaque bytes only.
