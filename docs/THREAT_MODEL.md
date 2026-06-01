# Threat model (MVP)

## Assets

- Message plaintext (SQLCipher database on device)
- Signal session state and identity keys (SQLCipher + native stub)
- JWT access/refresh tokens (`expo-secure-store`)
- Database encryption key (KEK in Secure Store, biometric-gated)

## Protections

| Threat | Mitigation |
|--------|------------|
| Stolen device, locked | SQLCipher file encryption; KEK requires biometric |
| Stolen device, unlocked | Plaintext readable until app lock (60s background) |
| Server compromise | Server stores ciphertext envelopes only |
| Network eavesdrop | TLS to API/SignalR (pinning deferred to Phase 4) |

## Out of scope (MVP)

- Groups, multi-device, sealed sender, encrypted attachments
