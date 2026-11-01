# Threat model (MVP)

## Goals

- **1:1 text** is end-to-end encrypted with the Signal Protocol (Double Ratchet).
- The **relay server** stores only opaque ciphertext envelopes and public key material.
- **Local data** is protected with SQLCipher (file encryption) and app lock (Strong biometric when available; otherwise an app PIN).

## In scope

| Asset | Protection |
|-------|------------|
| Message plaintext on wire | Signal Protocol ciphertext in `message_envelopes.ciphertext` |
| Reaction emoji / target | Same Signal envelopes (`t=reaction`); server never sees emoji or target ids in plaintext |
| Media plaintext | Client-side AES-256-GCM; MinIO stores ciphertext only ([e2ee-media.md](./e2ee-media.md)) |
| Message history on device | SQLCipher `gdot.db`; plaintext columns inside DB after unlock |
| Identity / session keys | SQLCipher tables + `crypto_prekeys`; identity private key in `local_identity` |
| JWT / refresh tokens | `expo-secure-store` |
| DB encryption key (KEK) | **Biometric mode:** `expo-secure-store` with `requireAuthentication` (Strong / Class 3). **PIN mode** (only when Strong biometrics are unavailable): KEK wrapped with scrypt (`N=2^15`, `r=8`, `p=1`) + AES-256-GCM; wrapped blob in SecureStore without biometric gate. |

## App lock modes

- Lock mode is chosen **once** at first KEK creation and is not migrated (no bio↔PIN switch without a full local wipe).
- **PIN mode** is offered only when Strong biometrics are unavailable. Min app PIN length is 8; letters, digits, and symbols are allowed.
- PIN mode is **weaker** against a local attacker who can extract the wrapped blob and offline-guess the PIN. Prefer Strong biometrics when the device supports them.

## Out of scope (MVP)

- Live calls, groups, multi-device fan-out, sealed sender
- Web client / SQLCipher on web
- Server-side message or media decryption
- Certificate pinning (documented in deployment guide for production)
- Hiding media metadata (size, timing, IP) — see [e2ee-media.md](./e2ee-media.md)

## Server trust

The server is an **honest relay**:

- Sees usernames, device metadata, envelope metadata (ids, timestamps, sizes).
- Never receives identity private keys, message plaintext, or reaction emoji/targets (with a correct Signal client).
- Can drop, delay, or reorder messages; cannot forge valid ciphertext without breaking Signal.

## Client assumptions

- User keeps the device locked when unattended (60s background → lock screen, DB closed).
- Unlocked device: plaintext is readable in memory and inside the open SQLCipher DB.
- Compromised OS/kernel can read memory while unlocked.
- Devices without Strong biometrics rely on the app PIN; a short or guessable PIN weakens local confidentiality.

## Known limitations

- **MVP crypto implementation:** Signal Protocol runs in **TypeScript** (`@privacyresearch/libsignal-protocol-typescript`, community port), not Signal’s official Rust `libsignal-client`. Production hardening should migrate to native libsignal (see follow-up plan).
- **Hermes TextDecoder:** iOS/Android load `lib/polyfills.ts` (`@borewit/text-codec`) at startup. The polyfill supplies missing encodings (`utf-16le`, `latin1`); it does not replace ratchet/curve math.
- **GPL-3.0:** The TS libsignal package is GPL-3.0-only — review licensing before commercial distribution.
- **SignalR JWT (WebSockets):** browsers/RN cannot set Authorization on the WS handshake, so the client still sends `access_token` as a query param. The server accepts it **only** on `/hubs/*` and strips it from the query string before request logging. Non-WS transports should use the Authorization header via `accessTokenFactory`.
- **Identity key change:** when a contact’s identity key changes, the client stores the new key as untrusted (`key_changed`), blocks sending until the user accepts (ChatRoom banner → safety number / accept), and still decrypts inbound so the user can see new-key messages while deciding.
- **Unknown senders**: inbound envelopes from devices without a local conversation are skipped until the user adds a contact.

## Verification tests

See E2EE plan §8: T1–T4, T6 (server integration tests + two-device manual T2).
