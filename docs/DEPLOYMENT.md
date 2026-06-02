# Gdot Chat — Full Deployment Guide (Beginner Friendly)

This document walks you through everything from zero: installing tools, running the server on your computer, putting the server on the internet, building the mobile app, and connecting the app to your server.

**What this project is:**

| Piece | Technology | What it does |
|-------|------------|--------------|
| **Mobile app** | Expo (React Native) | Chat UI on iPhone/Android |
| **Server** | ASP.NET Core 8 (.NET) | Stores accounts, relays encrypted messages |
| **Database** | PostgreSQL | Stores users, devices, message envelopes |

The mobile app talks to the server over **HTTPS** (REST API) and **WebSockets** (SignalR for real-time notifications).

```
┌─────────────────┐         HTTPS + SignalR         ┌──────────────────┐
│  Mobile app     │  ───────────────────────────► │  Gdot Chat API   │
│  (Expo / EAS)   │         /v1 + /hubs/messages  │  (.NET 8)        │
└─────────────────┘                               └────────┬─────────┘
                                                           │
                                                           ▼
                                                  ┌──────────────────┐
                                                  │  PostgreSQL      │
                                                  └──────────────────┘
```

---

## Table of contents

1. [Before you start](#1-before-you-start)
2. [Install required software (Windows)](#2-install-required-software-windows)
3. [Get the project on your computer](#3-get-the-project-on-your-computer)
4. [Run the server locally (development)](#4-run-the-server-locally-development)
5. [Run the mobile app locally (development)](#5-run-the-mobile-app-locally-development)
6. [Deploy the server to the internet (production)](#6-deploy-the-server-to-the-internet-production)
7. [Build and deploy the mobile app](#7-build-and-deploy-the-mobile-app)
8. [Connect the mobile app to your server](#8-connect-the-mobile-app-to-your-server)
9. [Verify everything works](#9-verify-everything-works)
10. [Troubleshooting](#10-troubleshooting)
11. [Glossary](#11-glossary)

---

## 1. Before you start

### Accounts you may need

| Account | Why | Cost |
|---------|-----|------|
| [GitHub](https://github.com) | Clone/download the code | Free |
| [Expo](https://expo.dev) | Build the mobile app in the cloud | Free tier available |
| [Google Play Console](https://play.google.com/console) | Publish Android app | One-time ~$25 |
| [Apple Developer](https://developer.apple.com) | Publish iPhone app | ~$99/year |
| Cloud provider (DigitalOcean, Hetzner, AWS, etc.) | Host the server online | ~$5–20/month |

You can develop and test **everything on your own computer** before paying for cloud hosting or app stores.

### Important: Expo Go will NOT work

This app uses **SQLCipher** (encrypted local database) and a **custom development client**. You cannot open it in the normal Expo Go app from the App Store.

You must either:

- Build a **development build** (recommended for daily work), or
- Use **EAS Build** in the cloud to produce an installable `.apk` / `.ipa`

---

## 2. Install required software (Windows)

Install these in order. Restart your computer after installing Docker if prompted.

### 2.1 Git

1. Download: https://git-scm.com/download/win
2. Run the installer — default options are fine.
3. Verify in **PowerShell**:

```powershell
git --version
```

### 2.2 Node.js (LTS)

1. Download: https://nodejs.org/ (choose **LTS**)
2. Install with defaults.
3. Verify:

```powershell
node --version
npm --version
```

You need **Node 18 or newer**.

### 2.3 .NET 8 SDK

1. Download: https://dotnet.microsoft.com/download/dotnet/8.0
2. Install **.NET SDK 8.x** (not just the runtime).
3. Verify:

```powershell
dotnet --version
```

You should see `8.x.x`.

### 2.4 Docker Desktop

PostgreSQL runs inside Docker so you do not have to install Postgres manually.

1. Download: https://www.docker.com/products/docker-desktop/
2. Install and start Docker Desktop.
3. Wait until Docker says it is **running** (whale icon in system tray).
4. Verify:

```powershell
docker --version
docker compose version
```

### 2.5 Android Studio (optional but recommended)

Needed if you want to run the app on an **Android emulator** or build Android locally.

1. Download: https://developer.android.com/studio
2. Install **Android Studio** with the Android SDK.
3. Open Android Studio → **Device Manager** → create a virtual device (e.g. Pixel 7, API 34).

### 2.6 Xcode (Mac only, for iOS)

If you have a Mac and want to run on iPhone simulator or build for iOS locally, install Xcode from the Mac App Store.

On Windows you can still build iOS apps using **EAS Build** in the cloud (no Mac required for building).

---

## 3. Get the project on your computer

Open **PowerShell** and run:

```powershell
cd C:\Users\mobas\Documents\projects
git clone <YOUR_REPO_URL> gdot-chat
cd gdot-chat
```

If you already have the folder, just:

```powershell
cd C:\Users\mobas\Documents\projects\gdot-chat
```

Install mobile app dependencies:

```powershell
npm install
```

---

## 4. Run the server locally (development)

The server lives in the `server/` folder. It needs PostgreSQL running first.

### Step 4.1 — Start PostgreSQL with Docker

```powershell
cd C:\Users\mobas\Documents\projects\gdot-chat\server
docker compose up -d
```

What this does:

- Starts PostgreSQL 16 in a container
- Database name: `gdotchat`
- Username: `gdot`
- Password: `gdot_dev`
- Port on your PC: **5433** (not the default 5432, to avoid conflicts)

Check it is running:

```powershell
docker compose ps
```

You should see `postgres` with state **running**.

### Step 4.2 — Apply database migrations

Migrations create the tables (users, devices, messages, etc.):

```powershell
dotnet ef database update -p GdotChat.Infrastructure -s GdotChat.Api
```

If you get an error that `dotnet ef` is not found, install the tool once:

```powershell
dotnet tool install --global dotnet-ef
```

Then run the `database update` command again.

### Step 4.3 — Start the API server

```powershell
dotnet run --project GdotChat.Api
```

Leave this terminal window open. When you see output like `Now listening on: https://localhost:5067`, the server is ready.

**URLs (local development):**

| What | URL |
|------|-----|
| Swagger (API docs in browser) | https://localhost:5067/swagger |
| REST API base | https://localhost:5067/v1 |
| HTTP (no SSL) | http://localhost:5066/v1 |
| SignalR hub | https://localhost:5067/hubs/messages |

Your browser may warn about the HTTPS certificate — that is normal for local development. Click **Advanced → Proceed** (wording varies by browser).

### Step 4.4 — Default configuration

Local settings are in `server/GdotChat.Api/appsettings.json`:

- **Database:** `Host=localhost;Port=5433;Database=gdotchat;Username=gdot;Password=gdot_dev`
- **JWT signing key:** a dev-only key (change this in production)

In **Development** mode, the server automatically runs migrations on startup. You still run `dotnet ef database update` the first time to be safe.

### Step 4.5 — Stop the server and database

Stop the server: press `Ctrl+C` in the terminal where it is running.

Stop PostgreSQL:

```powershell
cd C:\Users\mobas\Documents\projects\gdot-chat\server
docker compose down
```

To stop but **keep your data**:

```powershell
docker compose stop
```

---

## 5. Run the mobile app locally (development)

The app reads the server address from an environment variable.

### Step 5.1 — Create `.env` file

In the project root (`gdot-chat/`), create or edit `.env`:

```env
EXPO_PUBLIC_API_URL=http://YOUR_PC_IP:5066/v1
```

Replace `YOUR_PC_IP` with your computer's local network IP.

**Find your IP on Windows:**

```powershell
ipconfig
```

Look for **IPv4 Address** under your Wi‑Fi adapter, e.g. `192.168.0.177`.

**Example `.env`:**

```env
EXPO_PUBLIC_API_URL=http://192.168.0.177:5066/v1
```

Why port **5066** and **http**?

- Port **5066** is the HTTP port (no SSL certificate hassle on devices).
- Port **5067** is HTTPS (needs trusting a dev certificate on the phone).

The app builds the SignalR URL automatically from this setting (see `lib/config.ts`).

### Step 5.2 — Which URL to use per target

| Where you run the app | `EXPO_PUBLIC_API_URL` |
|-----------------------|------------------------|
| Same PC, iOS Simulator (Mac) | `https://localhost:5067/v1` |
| Android Emulator | `http://10.0.2.2:5066/v1` |
| Physical phone (same Wi‑Fi as PC) | `http://192.168.x.x:5066/v1` |
| Physical phone (server on internet) | `https://api.yourdomain.com/v1` |

**Physical phone requirements:**

- Phone and PC must be on the **same Wi‑Fi**
- Windows Firewall must allow inbound connections on port **5066**
- Server must be running (`dotnet run --project GdotChat.Api`)

**Allow through Windows Firewall (once):**

```powershell
New-NetFirewallRule -DisplayName "Gdot Chat API HTTP" -Direction Inbound -LocalPort 5066 -Protocol TCP -Action Allow
```

### Step 5.3 — Create a development build (first time)

Because this app cannot use Expo Go, run a **development build**:

**Option A — Build on your machine (Android):**

```powershell
cd C:\Users\mobas\Documents\projects\gdot-chat
npx expo prebuild
npx expo run:android
```

This compiles and installs the app on a connected device or emulator.

**Option B — Build in the cloud with EAS (Android or iOS):**

```powershell
npm install -g eas-cli
eas login
eas build --profile development --platform android
```

When the build finishes, Expo gives you a link to download and install the `.apk`.

See [Section 7](#7-build-and-deploy-the-mobile-app) for full EAS details.

### Step 5.4 — Start the dev server

After you have a development build installed:

```powershell
cd C:\Users\mobas\Documents\projects\gdot-chat
npx expo start --dev-client
```

Open the **Gdot Chat** development app on your phone (not Expo Go). It connects to Metro bundler and loads your JavaScript.

### Step 5.4b — Phone shows "Socket timeout" / cannot load project

Metro on your PC is fine if the terminal shows `Web Bundled`. The phone must reach **port 8081** on your PC.

**Run once:**

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-metro-device.ps1
```

**Then fix the most common causes:**

| Cause | Fix |
|-------|-----|
| **VPN on phone** (key icon in status bar) | Turn VPN **off** while developing |
| Windows Firewall | Script above allows port 8081 (or run PowerShell as Admin) |
| Guest Wi‑Fi / different networks | Use same Wi‑Fi as PC, not guest isolation |
| USB (most reliable) | Enable USB debugging, run script (uses `adb reverse`), open bundler URL `http://127.0.0.1:8081` in dev menu |

**USB workflow:**

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-metro-device.ps1
npx expo start --dev-client --clear
```

On the phone: open the dev client → dev menu → set bundler to `http://127.0.0.1:8081` → Reload.

**Alternative:** `npx expo start --dev-client --tunnel` (slower, works through some VPNs).

### Step 5.5 — Change server address later

1. Edit `.env`
2. Stop Expo (`Ctrl+C`)
3. Run `npx expo start --dev-client` again

For EAS builds, set the variable in `eas.json` or Expo dashboard secrets (see Section 8).

---

## 6. Deploy the server to the internet (production)

When you want friends to use the app without your PC running, host the API on a **VPS** (virtual private server) with a **domain name** and **HTTPS**.

This guide uses **Ubuntu 22.04** on a VPS. Providers: [DigitalOcean](https://digitalocean.com), [Hetzner](https://hetzner.com), [Linode](https://linode.com), [AWS Lightsail](https://aws.amazon.com/lightsail/).

### Overview of production setup

```
Internet
   │
   ▼
┌─────────────┐     ┌─────────────┐     ┌──────────────┐
│   Domain    │────►│   Caddy or  │────►│  .NET API    │
│ api.example │     │   nginx     │     │  port 5000   │
│    .com     │ SSL │  (reverse   │     │  (internal)  │
└─────────────┘     │   proxy)    │     └──────┬───────┘
                    └─────────────┘            │
                                               ▼
                                        ┌──────────────┐
                                        │ PostgreSQL   │
                                        │ (Docker)     │
                                        └──────────────┘
```

### Step 6.1 — Buy a domain and point it to your server

1. Buy a domain (Namecheap, Cloudflare, Google Domains, etc.).
2. Create an **A record**: `api.yourdomain.com` → your VPS public IP address.
3. Wait 5–30 minutes for DNS to propagate.

### Step 6.2 — Create a VPS

- **OS:** Ubuntu 22.04 LTS
- **Size:** 1 GB RAM minimum (2 GB recommended)
- Note the **public IP address**

SSH into the server from PowerShell:

```powershell
ssh root@YOUR_SERVER_IP
```

(On first connect, type `yes` when asked about fingerprint.)

### Step 6.3 — Install Docker on the server

```bash
apt update && apt upgrade -y
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker
```

### Step 6.4 — Run PostgreSQL on the server

Create a folder and `docker-compose.yml`:

```bash
mkdir -p /opt/gdotchat
cd /opt/gdotchat
nano docker-compose.yml
```

Paste (change the password to something strong):

```yaml
services:
  postgres:
    image: postgres:16
    restart: unless-stopped
    environment:
      POSTGRES_USER: gdot
      POSTGRES_PASSWORD: CHANGE_THIS_STRONG_PASSWORD
      POSTGRES_DB: gdotchat
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "127.0.0.1:5432:5432"

volumes:
  pgdata:
```

Start it:

```bash
docker compose up -d
```

PostgreSQL is only reachable from the server itself (`127.0.0.1`), not from the internet — that is intentional for security.

### Step 6.5 — Install .NET 8 on the server

```bash
wget https://packages.microsoft.com/config/ubuntu/22.04/packages-microsoft-prod.deb -O packages-microsoft-prod.deb
dpkg -i packages-microsoft-prod.deb
rm packages-microsoft-prod.deb
apt update
apt install -y aspnetcore-runtime-8.0
```

For running migrations you also need the SDK on the server **once**, or run migrations from your PC against the remote database.

### Step 6.6 — Publish the API from your Windows PC

On your **Windows** machine:

```powershell
cd C:\Users\mobas\Documents\projects\gdot-chat\server
dotnet publish GdotChat.Api -c Release -o ./publish
```

Copy to the server (replace IP and path):

```powershell
scp -r .\publish\* root@YOUR_SERVER_IP:/opt/gdotchat/api/
```

Also copy migration tooling if you will migrate from the server:

```powershell
scp -r .\GdotChat.Infrastructure root@YOUR_SERVER_IP:/opt/gdotchat/
scp .\GdotChat.Api\GdotChat.Api.csproj root@YOUR_SERVER_IP:/opt/gdotchat/GdotChat.Api/
scp .\GdotChat.slnx root@YOUR_SERVER_IP:/opt/gdotchat/
```

### Step 6.7 — Production configuration

On the server, create `/opt/gdotchat/api/appsettings.Production.json`:

```bash
nano /opt/gdotchat/api/appsettings.Production.json
```

```json
{
  "ConnectionStrings": {
    "Default": "Host=127.0.0.1;Port=5432;Database=gdotchat;Username=gdot;Password=CHANGE_THIS_STRONG_PASSWORD"
  },
  "Jwt": {
    "SigningKey": "GENERATE-A-RANDOM-STRING-AT-LEAST-32-CHARACTERS-LONG",
    "Issuer": "gdot-chat",
    "Audience": "gdot-chat-mobile",
    "AccessTokenMinutes": 15,
    "RefreshTokenDays": 30
  },
  "Relay": {
    "EnvelopeTtlDays": 7,
    "PreKeyLowThreshold": 10
  }
}
```

**Generate a strong JWT key** (on the server):

```bash
openssl rand -base64 48
```

Paste the output as `SigningKey`.

> **Critical:** Never use the dev signing key from `appsettings.json` in production. Never commit production passwords to Git.

### Step 6.8 — Run database migrations (production)

**Important:** In Production mode, the server does **not** auto-migrate. You must run migrations manually.

**Option A — From your PC** (install SDK on server temporarily, or use EF from dev machine with remote connection — only if you opened Postgres to your IP, not recommended).

**Option B — On the server** (recommended):

```bash
# Install SDK once for migrations
apt install -y dotnet-sdk-8.0
dotnet tool install --global dotnet-ef

cd /opt/gdotchat
export ASPNETCORE_ENVIRONMENT=Production
dotnet ef database update -p GdotChat.Infrastructure -s GdotChat.Api
```

If you only copied the `publish` folder, upload the full `server` source instead, run migrations, then use `dotnet publish` output for runtime.

### Step 6.9 — Run the API as a systemd service

```bash
nano /etc/systemd/system/gdotchat-api.service
```

```ini
[Unit]
Description=Gdot Chat API
After=network.target docker.service

[Service]
WorkingDirectory=/opt/gdotchat/api
ExecStart=/usr/bin/dotnet /opt/gdotchat/api/GdotChat.Api.dll
Restart=always
RestartSec=10
Environment=ASPNETCORE_ENVIRONMENT=Production
Environment=ASPNETCORE_URLS=http://127.0.0.1:5000

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
systemctl daemon-reload
systemctl enable gdotchat-api
systemctl start gdotchat-api
systemctl status gdotchat-api
```

Check logs:

```bash
journalctl -u gdotchat-api -f
```

### Step 6.10 — HTTPS with Caddy (easiest)

Caddy automatically gets a free SSL certificate from Let's Encrypt.

```bash
apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update
apt install -y caddy

nano /etc/caddy/Caddyfile
```

Replace `api.yourdomain.com` with your domain:

```
api.yourdomain.com {
    reverse_proxy 127.0.0.1:5000
}
```

Reload Caddy:

```bash
systemctl reload caddy
```

Your API is now at:

- REST: `https://api.yourdomain.com/v1`
- SignalR: `https://api.yourdomain.com/hubs/messages`
- Swagger is **disabled** in Production (only available in Development)

### Step 6.11 — Firewall

```bash
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw enable
```

Do **not** expose PostgreSQL port 5432 to the internet.

### Step 6.12 — Production security checklist

- [ ] Changed PostgreSQL password from `gdot_dev`
- [ ] Generated new JWT `SigningKey` (32+ characters)
- [ ] `ASPNETCORE_ENVIRONMENT=Production`
- [ ] HTTPS enabled (Caddy/nginx + valid certificate)
- [ ] Database bound to `127.0.0.1` only
- [ ] Firewall allows only 22, 80, 443
- [ ] Ran `dotnet ef database update` before first start
- [ ] Backups configured for PostgreSQL volume (`pgdata`)

### Updating the server later

On your PC:

```powershell
cd server
dotnet publish GdotChat.Api -c Release -o ./publish
scp -r .\publish\* root@YOUR_SERVER_IP:/opt/gdotchat/api/
```

On the server:

```bash
systemctl restart gdotchat-api
```

If you added new migrations:

```bash
cd /opt/gdotchat
dotnet ef database update -p GdotChat.Infrastructure -s GdotChat.Api
systemctl restart gdotchat-api
```

---

## 7. Build and deploy the mobile app

The app is configured for [EAS (Expo Application Services)](https://docs.expo.dev/eas/). Your project already has an EAS project ID in `app.json`.

### Step 7.1 — Create an Expo account and log in

1. Sign up: https://expo.dev/signup
2. Log in from your PC:

```powershell
npm install -g eas-cli
eas login
```

### Step 7.2 — Understand build profiles

Defined in `eas.json`:

| Profile | Purpose | Who installs |
|---------|---------|--------------|
| `development` | Dev client with debugging | You (developers) |
| `preview` | Internal testing APK/IPA | Testers (link or TestFlight) |
| `production` | Store-ready release | App Store / Play Store |

### Step 7.3 — Configure app identity

**Android** (already set in `app.json`):

- Package name: `com.amirmatin.GDOTchat`

**iOS** — add a bundle identifier before App Store build. Edit `app.json`:

```json
"ios": {
  "supportsTablet": true,
  "bundleIdentifier": "com.yourcompany.gdotchat"
}
```

Use a reverse-domain name you control.

You can also rename `name`, `slug`, and icons under `assets/images/` before release.

### Step 7.4 — Set production API URL for builds

Environment variables are baked in at **build time** for `EXPO_PUBLIC_*` variables.

**Option A — EAS secret (recommended for production builds):**

```powershell
eas secret:create --scope project --name EXPO_PUBLIC_API_URL --value https://api.yourdomain.com/v1
```

**Option B — Per-profile env in `eas.json`:**

```json
{
  "build": {
    "preview": {
      "distribution": "internal",
      "env": {
        "EXPO_PUBLIC_API_URL": "https://api.yourdomain.com/v1"
      }
    },
    "production": {
      "autoIncrement": true,
      "env": {
        "EXPO_PUBLIC_API_URL": "https://api.yourdomain.com/v1"
      }
    }
  }
}
```

Replace `https://api.yourdomain.com/v1` with your real server URL.

### Step 7.5 — Build for Android

**Development build** (for daily coding):

```powershell
eas build --profile development --platform android
```

**Preview** (share with testers):

```powershell
eas build --profile preview --platform android
```

When finished, Expo shows a QR code and download link for the `.apk` or `.aab`.

**Production** (Play Store):

```powershell
eas build --profile production --platform android
```

First time, EAS asks to create a keystore — choose **Let Expo handle it** unless you have your own.

### Step 7.6 — Build for iOS

Requires an **Apple Developer** account for device installs and App Store.

```powershell
eas build --profile development --platform ios
eas build --profile preview --platform ios
eas build --profile production --platform ios
```

EAS walks you through Apple credentials (certificates, provisioning profiles).

### Step 7.7 — Submit to app stores

**Google Play:**

1. Create an app in [Google Play Console](https://play.google.com/console)
2. Submit the production build:

```powershell
eas submit --platform android --profile production
```

**Apple App Store:**

1. Create an app in [App Store Connect](https://appstoreconnect.apple.com)
2. Submit:

```powershell
eas submit --platform ios --profile production
```

Store review can take days. Follow each store's privacy, encryption, and permissions guidelines (camera/microphone are used for voice/video messages).

### Step 7.8 — Install a preview build on a phone

**Android:**

1. Open the build URL from EAS on your phone
2. Download and install the APK
3. You may need to allow **Install from unknown sources** for your browser

**iOS:**

1. Register device UDIDs for ad-hoc builds, or use TestFlight for preview/production
2. Follow Expo's install instructions from the build page

---

## 8. Connect the mobile app to your server

The app reads the server address in this order (`lib/config.ts`):

1. `app.json` → `expo.extra.apiBaseUrl` (if set)
2. Environment variable `EXPO_PUBLIC_API_URL`
3. Fallback hardcoded default (change this for your team)

**SignalR URL is derived automatically:**

```
API:  https://api.yourdomain.com/v1
Hub:  https://api.yourdomain.com/hubs/messages
```

### Development (PC on Wi‑Fi)

```env
EXPO_PUBLIC_API_URL=http://192.168.0.177:5066/v1
```

### Production (server on internet)

```env
EXPO_PUBLIC_API_URL=https://api.yourdomain.com/v1
```

After changing env vars:

- **Local dev:** restart `npx expo start --dev-client`
- **EAS builds:** run a **new build** — changing `.env` does not update already-installed apps

---

## 9. Verify everything works

### Server health

1. Open `https://api.yourdomain.com/swagger` — works only in **Development**. In production, test an endpoint instead.
2. Or from PowerShell:

```powershell
curl https://api.yourdomain.com/v1/auth/login -Method POST -ContentType "application/json" -Body '{"email":"test@example.com","password":"wrong"}'
```

You should get a JSON error (401/400), not a connection failure.

### End-to-end chat test

1. Start server (local or production)
2. Install app on **two** phones (or one phone + one emulator)
3. **Register** user A on device 1
4. **Register** user B on device 2
5. On A: search for B, start a chat, send a message
6. B should receive the message (via SignalR + pending message pull)

See `server/README.md` for the detailed manual checklist.

---

## 10. Troubleshooting

### "Cannot connect to server" on phone

| Check | Fix |
|-------|-----|
| Wrong IP in `.env` | Run `ipconfig`, update `EXPO_PUBLIC_API_URL` |
| Server not running | Run `dotnet run --project GdotChat.Api` |
| Different Wi‑Fi | Phone and PC must be on same network |
| Windows Firewall | Allow port 5066 (see Section 5.2) |
| Used `localhost` on phone | `localhost` on the phone means the phone itself — use PC's LAN IP |
| Production URL wrong | Rebuild app with correct `EXPO_PUBLIC_API_URL` |

### Android emulator cannot reach API

Use:

```env
EXPO_PUBLIC_API_URL=http://10.0.2.2:5066/v1
```

`10.0.2.2` is the emulator's special alias for your PC's `localhost`.

### HTTPS certificate errors

- **Local dev:** prefer **HTTP port 5066** on physical devices
- **Production:** use a real domain with Let's Encrypt (Caddy section above)

### `dotnet ef` not found

```powershell
dotnet tool install --global dotnet-ef
```

Close and reopen PowerShell.

### Docker: "port 5433 already allocated"

Another Postgres is using the port. Stop it or change the port in `server/docker-compose.yml` and update `appsettings.json` to match.

### Database connection failed

1. `docker compose ps` — is postgres running?
2. Connection string matches docker-compose user/password/port
3. On production: is Postgres on `127.0.0.1:5432`?

### Expo Go opens but app crashes or fails

This project **requires a development build**, not Expo Go.

### Android build: TLS handshake / `asm-7.0.jar` / Maven Central

Error like `Remote host terminated the handshake` when downloading from `repo.maven.apache.org` is a **network/TLS** issue (antivirus HTTPS scanning, firewall, or regional blocking).

The project adds **Maven mirrors** (`repo1.maven.org`) in `android/build.gradle` and patches `react-native-pager-view` to avoid an obsolete AGP 4.2.1 download.

If it still fails:

1. Temporarily disable antivirus **HTTPS/SSL scanning**
2. Use Android Studio's JDK: set `JAVA_HOME` to `C:\Program Files\Android\Android Studio\jbr`
3. Retry: `cd android` then `.\gradlew.bat --stop` and `npx expo run:android`

### Android build: `Could not find manifest-merger-31.5.0.jar`

Gradle downloaded Android build-tool **metadata** but failed to download the actual **JAR** file, leaving a broken cache entry.

**Fix (run from project root):**

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\fix-android-gradle.ps1
npx expo run:android
```

Or manually:

```powershell
cd android
.\gradlew.bat --stop
Remove-Item -Recurse -Force "$env:USERPROFILE\.gradle\caches\modules-2\files-2.1\com.android.tools.build" -ErrorAction SilentlyContinue
cd ..
npx expo run:android
```

**Also set Android SDK path** (if not already set):

```powershell
[System.Environment]::SetEnvironmentVariable("ANDROID_HOME", "$env:LOCALAPPDATA\Android\Sdk", "User")
```

Restart PowerShell after running that, then try again.

**If it still fails:** your network may block `dl.google.com` (Google Maven). Try:

1. A VPN, or disable antivirus web scanning temporarily
2. Build in the cloud instead: `eas build --profile development --platform android`

### EAS build fails

```powershell
eas build --platform android --profile preview --clear-cache
```

Check the build logs on expo.dev. Common issues: missing Apple credentials (iOS), invalid `app.json`, network timeouts.

### Migrations fail in production

Ensure `ASPNETCORE_ENVIRONMENT=Production` and `appsettings.Production.json` has the correct connection string before running `dotnet ef database update`.

### Rate limiting during testing

The server limits registration (5/hour per IP) and login attempts. Wait or test from a different network in production. Limits are relaxed in the test environment only.

---

## 11. Glossary

| Term | Meaning |
|------|---------|
| **API** | The server's HTTP interface (`/v1/...`) |
| **SignalR** | Real-time WebSocket connection for "new message" notifications |
| **EAS** | Expo Application Services — cloud builds for iOS/Android |
| **Development build** | Custom version of your app that loads JS from your dev machine |
| **Expo Go** | Generic Expo app — **not supported** for this project |
| **Migration** | Scripts that create/update database tables |
| **JWT** | Token the app sends to prove it is logged in |
| **VPS** | A small Linux server on the internet |
| **Reverse proxy** | Caddy/nginx — handles HTTPS and forwards to .NET |
| **ENV / `.env`** | File holding configuration like server URL |
| **PostgreSQL** | The SQL database storing users and encrypted message envelopes |

---

## Quick reference commands

### Local development (copy-paste)

**Terminal 1 — Database + API:**

```powershell
cd C:\Users\mobas\Documents\projects\gdot-chat\server
docker compose up -d
dotnet ef database update -p GdotChat.Infrastructure -s GdotChat.Api
dotnet run --project GdotChat.Api
```

**Terminal 2 — Mobile app:**

```powershell
cd C:\Users\mobas\Documents\projects\gdot-chat
npx expo start --dev-client
```

### Production URLs to remember

| Item | Value |
|------|-------|
| REST API | `https://api.yourdomain.com/v1` |
| SignalR | `https://api.yourdomain.com/hubs/messages` |
| Mobile env var | `EXPO_PUBLIC_API_URL=https://api.yourdomain.com/v1` |

---

## Related docs

- [server/README.md](../server/README.md) — server quick start and integration tests
- [docs/PROTOCOL.md](./PROTOCOL.md) — API endpoints and SignalR events
- [Expo EAS Build docs](https://docs.expo.dev/build/introduction/)
- [.NET 8 download](https://dotnet.microsoft.com/download/dotnet/8.0)
