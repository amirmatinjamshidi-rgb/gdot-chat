# End-to-end encrypted media

E2EE means the relay cannot decrypt the media. It does not hide metadata such as timing, size, or IP addresses.

The server may temporarily store encrypted ciphertext, but this is not permanent media storage. Successful retrieval deletes the attachment and TTL removes abandoned transfers.

## 1. Threat model

**In scope**

- 1:1 voice messages, video messages, and other recorded media files up to the configured size limit (default 1 GiB).
- Confidentiality and authenticity of media plaintext against the ASP.NET relay, MinIO, and network observers.
- Delivery of the media key only inside an existing Signal-encrypted control message.

**Out of scope**

- Live calls, groups, multi-device fan-out.
- Hiding attachment existence, size, chunk count, timing, or IP addresses.
- Encrypting decrypted media files at rest on the device (SQLCipher protects DB rows, not the media file).
- Identity verification beyond the existing Safety Number flow.

**Honest relay**

The server may see sender/recipient device IDs, attachment IDs, plaintext size, chunk counts, ciphertext sizes, timestamps, and HTTP metadata. It must never see media plaintext, the AES media key, Signal private keys, or plaintext filenames stored only in the Signal descriptor.

## 2. Architecture

```
Signal = key/control plane
MinIO = temporary ciphertext data plane
ASP.NET = authenticated opaque relay
Device = only place where media is encrypted/decrypted
```

```
Alice device
  | plaintext exists only locally
  | AES-256-GCM chunk encryption
  v
encrypted chunks --HTTPS--> ASP.NET --private network--> MinIO
  |
  +-- Signal-encrypted JSON descriptor (contains key) --> Bob
                                                          |
                                                          v
                                              download chunks, decrypt locally
```

`POST /v1/messages` never carries media bytes. It only carries small Signal ciphertext.

## 3. Signal control plane

New application plaintext is a versioned envelope.

Text:

```json
{ "v": 1, "t": "text", "text": "hello" }
```

Media:

```json
{
  "v": 1,
  "t": "media",
  "kind": "voice",
  "attachmentId": "<uuid>",
  "algorithm": "A256GCM-CHUNKED-V1",
  "size": 1842731,
  "chunkSize": 4194304,
  "chunkCount": 1,
  "mimeType": "audio/mp4",
  "durationMs": 12750,
  "key": "<base64url>",
  "noncePrefix": "<base64url>"
}
```

Optional Signal-only fields: `fileName`, `caption`, `width`, `height`.

Legacy decrypted strings remain text. Recipients parse `v=1` typed JSON when valid; otherwise they treat the plaintext as a pre-migration text message. Media descriptors are never rendered as text bubbles.

Server `MessageType` stays Signal 2/3. The server does not learn `voice` vs `video`.

## 4. Attachment data plane

Clients call:

| Method | Path | Who |
|--------|------|-----|
| POST | `/v1/attachments` | sender |
| PUT | `/v1/attachments/{id}/chunks/{index}` | sender |
| GET | `/v1/attachments/{id}` | sender or recipient |
| POST | `/v1/attachments/{id}/complete` | sender |
| GET | `/v1/attachments/{id}/chunks/{index}` | recipient |
| POST | `/v1/attachments/{id}/download-complete` | recipient |
| DELETE | `/v1/attachments/{id}` | sender |

Authorization uses JWT `device_id` (`ClaimsPrincipal.GetDeviceId()`). Attachment IDs are not capabilities.

The Signal descriptor is sent only after `POST .../complete` succeeds.

## 5. Key generation

Each attachment gets a fresh 32-byte AES key and an 8-byte nonce prefix from a CSPRNG (`crypto.getRandomValues`, polyfilled with `expo-crypto` on Hermes). Keys are **not** derived from Signal keys, identity keys, usernames, device IDs, passwords, or conversation IDs.

## 6. Chunk encryption

Package: `@noble/ciphers` AES-GCM (`gcm` from `@noble/ciphers/aes.js`).

- Algorithm: AES-256-GCM (`A256GCM-CHUNKED-V1`)
- Key: 32 bytes
- Tag: 16 bytes (ciphertext \|\| tag)
- Default plaintext chunk size: 4 MiB (server-configured)
- Ciphertext length: `plainChunk + 16` (last chunk uses remaining plaintext)

## 7. Nonce construction

```
chunkNonce = noncePrefix (8 bytes) || uint32_be(chunkIndex)
```

12-byte GCM nonce, unique per chunk under a given file key.

## 8. AAD

Canonical binary AAD:

```
UTF-8("gdot-media-v1") || 0x1F || UTF-8(attachmentId) || 0x1F
|| uint32_be(chunkIndex) || uint32_be(chunkCount) || uint64_be(plaintextSize)
```

Moving a ciphertext chunk to another attachment or index fails authentication.

## 9. Upload protocol

1. Validate local file and size.
2. Generate key + nonce prefix.
3. `POST /v1/attachments` with recipient user/device and plaintext size.
4. Read ~4 MiB from disk, encrypt, `PUT` raw `application/octet-stream`.
5. Repeat; resume from `GET /v1/attachments/{id}` uploaded chunk indexes.
6. `POST .../complete` — server verifies every object exists with the expected ciphertext size.
7. Signal-encrypt the descriptor and `POST /v1/messages`.

## 10. Download protocol

1. Decrypt Signal envelope and parse the descriptor.
2. Persist descriptor + key in SQLCipher.
3. ACK the Signal envelope **before** the full media download finishes.
4. Auto-download according to `stores/media-store.ts` (`never` = manual).
5. `GET` missing chunks, decrypt, write plaintext at the chunk offset.
6. After AEAD success and local size match, `POST .../download-complete`.

## 11. Authorization

| Endpoint | Caller |
|----------|--------|
| create / PUT chunk / complete / DELETE | sender device |
| GET status | sender or recipient |
| GET chunk / download-complete | recipient device |

Missing or expired attachments return 404. Wrong party returns 403. Invalid transfer state returns 409. Oversize create returns 413.

## 12. MinIO role

MinIO stores opaque objects named `attachments/{attachmentId}/{chunkIndex:D6}`.

Mobile clients never receive MinIO credentials or a public MinIO URL. The API process talks to `127.0.0.1:9000` on the host.

PostgreSQL stores only attachment lifecycle metadata (ids, sizes, chunk layout, status, TTL). No key, nonce, filename, or MIME type.

## 13. MinIO server-side encryption

E2EE does **not** depend on MinIO SSE.

Local docker-compose leaves SSE off by default so development does not require a KMS. Production should enable MinIO SSE-KMS (KES or equivalent) with secrets from the environment, for example:

```
MINIO_KMS_SECRET_KEY=gdot-dev:<base64-32-bytes>
```

and set `Minio:UseServerSideEncryption=true` on the API. Do not put KMS secrets in source control. SSE-S3 via `SSES3()` is used when that flag is true.

## 14. TTL / deletion

Default attachment TTL is 7 days (configurable, independent of Signal envelope TTL). An hourly worker deletes expired MinIO objects and metadata, including incomplete uploads and abandoned ready attachments. `download-complete` deletes ciphertext immediately. Deletion is idempotent; missing objects are tolerated.

## 15. Metadata leakage

Observers can infer that two devices exchanged a file of a given size at a given time. Chunk upload timing leaks transfer progress. This is expected for an honest-relay MVP.

## 16. Local plaintext media limitation

After decrypt, the playable file lives in app-private storage (`document/gdot-media/{attachmentId}.ext`). SQLCipher encrypts the media key and descriptor, not the media file itself. An unlocked or rooted device can read decrypted media.

## 17. Multi-device limitation

Attachments are uploaded for a single `recipientDeviceId`. There is no fan-out. Additional devices will not receive the media key or ciphertext in this MVP.

## 18. Offline recipient

The sender can finish upload and send the Signal descriptor while the recipient is offline. Ciphertext remains in MinIO until download or TTL.

## 19. Malicious relay

A malicious relay can drop, delay, or truncate chunks, lie about status, or substitute ciphertext. AEAD authentication fails on substitution. It cannot recover the AES key from stored objects or metadata. It cannot forge a Signal descriptor.

## 20. Recovery / resume

Clients persist uploaded/downloaded chunk indexes in SQLCipher. After an app crash they skip completed chunks. Per-chunk HTTP timeout is 120 seconds. A 45-second whole-file timeout is not used.

## Configuration

| Setting | Default | Notes |
|---------|---------|--------|
| `Attachments:MaxSizeBytes` | 1 GiB | 413 when exceeded |
| `Attachments:ChunkSizeBytes` | 4 MiB | server-enforced |
| `Attachments:TtlDays` | 7 | cleanup worker |
| `Attachments:MaxActivePerDevice` | 20 | create rejected with 409 |
| `Attachments:CreatePermitLimit` | 20 / device / hour | |
| `Attachments:ChunkPermitLimit` | 180 / device / minute | upload and download |
| `Minio:Endpoint` | `127.0.0.1:9000` | not exposed to phones |
| `VIDEO_RECORD_MAX_MS` | 20 minutes | product UX cap, not a protocol limit |
