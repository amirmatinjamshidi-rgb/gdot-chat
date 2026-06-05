# Threat model (MVP)

## Goals

- **1:1 text** is end-to-end encrypted with the Signal Protocol (Double Ratchet).
- The **relay server** stores only opaque ciphertext envelopes and public key material.
- **Local data** is protected with SQLCipher (file encryption) and biometric app lock.

## In scope

| Asset | Protection |
|-------|------------|
| Message plaintext on wire | Signal Protocol ciphertext in `message_envelopes.ciphertext` |
| Message history on device | SQLCipher `gdot.db`; plaintext columns inside DB after unlock |
| Identity / session keys | SQLCipher tables + `crypto_prekeys`; identity private key in `local_identity` |
| JWT / refresh tokens | `expo-secure-store` |
| DB encryption key (KEK) | `expo-secure-store` with `requireAuthentication` |

## Out of scope (MVP)

- Voice/video E2EE (UI disabled; not stored in SQLCipher)
- Groups, multi-device, sealed sender
- Web client / SQLCipher on web
- Server-side message decryption
- Certificate pinning (documented in deployment guide for production)

## Server trust

The server is an **honest relay**:

- Sees usernames, device metadata, envelope metadata (ids, timestamps, sizes).
- Never receives identity private keys or message plaintext (with a correct Signal client).
- Can drop, delay, or reorder messages; cannot forge valid ciphertext without breaking Signal.

## Client assumptions

- User keeps the device locked when unattended (60s background → lock screen, DB closed).
- Unlocked device: plaintext is readable in memory and inside the open SQLCipher DB.
- Compromised OS/kernel can read memory while unlocked.

## Known limitations

- **MVP crypto implementation:** Signal Protocol runs in **TypeScript** (`@privacyresearch/libsignal-protocol-typescript`, community port), not Signal’s official Rust `libsignal-client`. Production hardening should migrate to native libsignal (see follow-up plan).
- **Hermes TextDecoder:** iOS/Android load `lib/polyfills.ts` (`@borewit/text-codec`) at startup. The polyfill supplies missing encodings (`utf-16le`, `latin1`); it does not replace ratchet/curve math.
- **GPL-3.0:** The TS libsignal package is GPL-3.0-only — review licensing before commercial distribution.
- **SignalR JWT** is passed as `access_token` query parameter (may appear in logs/proxies). Prefer header auth in hardened deployments.
- **Offline auth** exists only in `__DEV__` builds.
- **Unknown senders**: inbound envelopes from devices without a local conversation are skipped until the user adds a contact.

## Verification tests

See E2EE plan §8: T1–T4, T6 (server integration tests + two-device manual T2).
