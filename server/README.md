# Gdot Chat Server

ASP.NET Core 8 ciphertext relay API compatible with the Expo client (`lib/api/`).

## Prerequisites

- [.NET 8 SDK](https://dotnet.microsoft.com/download)
- [Docker](https://www.docker.com/) (for PostgreSQL and integration tests)

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

PostgreSQL is exposed on **port 5433** (avoids conflict with a local Postgres on 5432).

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
