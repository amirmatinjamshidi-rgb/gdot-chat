# Protocol summary

See [secure_chat_e2ee_sqlcipher.plan.md](../.cursor/plans/secure_chat_e2ee_sqlcipher.plan.md) for full REST, SignalR, PostgreSQL, and SQLCipher schemas.

- REST base: `/v1` — auth, users, devices/prekeys, messages relay
- SignalR: `/hubs/messages` — `EnvelopeAvailable` push
- Local: `gdot.db` via `expo-sqlite` + `useSQLCipher: true`, `PRAGMA key` from KEK
