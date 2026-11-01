import { bytesToBase64Url, base64UrlToBytes } from "@/lib/crypto/encoding";

export const SIGNAL_PAYLOAD_VERSION = 1;
export const MEDIA_ALGORITHM = "A256GCM-CHUNKED-V1";
export const MEDIA_GCM_TAG_BYTES = 16;
export const MEDIA_NONCE_PREFIX_BYTES = 8;
export const MEDIA_KEY_BYTES = 32;
export const DEFAULT_MEDIA_CHUNK_SIZE = 4 * 1024 * 1024;
export const MAX_ATTACHMENT_BYTES = 1024 * 1024 * 1024;

export type SignalPayloadType =
  | "text"
  | "media"
  | "reaction"
  | "receipt"
  | "group_control";
export type MediaKind = "voice" | "video";
export type ReactionOp = "add" | "remove";

export interface TextPayload {
  v: 1;
  t: "text";
  text: string;
  /** Stable sender client id for dedupe + delivery receipts. */
  clientMessageId?: string;
}

export interface MediaPayload {
  v: 1;
  t: "media";
  kind: MediaKind;
  attachmentId: string;
  algorithm: typeof MEDIA_ALGORITHM;
  size: number;
  chunkSize: number;
  chunkCount: number;
  mimeType: string;
  durationMs?: number;
  width?: number;
  height?: number;
  fileName?: string;
  caption?: string;
  key: string;
  noncePrefix: string;
  /** Stable sender client id for dedupe after session-reset resend. */
  clientMessageId?: string;
}

export interface ReactionPayload {
  v: 1;
  t: "reaction";
  op: ReactionOp;
  /** Stable cross-device id of the reacted message (server envelope id). */
  targetServerEnvelopeId: string;
  emoji: string;
}

export interface ReceiptPayload {
  v: 1;
  t: "receipt";
  /** delivered (default) or read */
  kind?: "delivered" | "read";
  /** Sender client message ids that were successfully decrypted / read. */
  messageIds: string[];
  /** When set, receipt is about a group message (still sent pairwise E2EE). */
  groupId?: string;
}

export type GroupControlEvent = "added" | "removed" | "left" | "renamed";

export interface GroupControlPayload {
  v: 1;
  t: "group_control";
  event: GroupControlEvent;
  actorUserId: string;
  subjectUserId?: string;
  /** Opaque/display name for renamed */
  name?: string;
}

export type TypedSignalPayload =
  | TextPayload
  | MediaPayload
  | ReactionPayload
  | ReceiptPayload
  | GroupControlPayload;

export type ParsedSignalPlaintext =
  | { kind: "legacy-text"; text: string }
  | { kind: "text"; payload: TextPayload }
  | { kind: "media"; payload: MediaPayload }
  | { kind: "reaction"; payload: ReactionPayload }
  | { kind: "receipt"; payload: ReceiptPayload }
  | { kind: "group_control"; payload: GroupControlPayload };

export function serializeTextPayload(
  text: string,
  clientMessageId?: string,
): string {
  const payload: TextPayload = { v: 1, t: "text", text };
  if (clientMessageId) payload.clientMessageId = clientMessageId;
  return JSON.stringify(payload);
}

export function serializeReceiptPayload(
  messageIds: string[],
  opts?: { kind?: "delivered" | "read"; groupId?: string },
): string {
  const payload: ReceiptPayload = {
    v: 1,
    t: "receipt",
    messageIds: [...messageIds],
  };
  if (opts?.kind) payload.kind = opts.kind;
  if (opts?.groupId) payload.groupId = opts.groupId;
  return JSON.stringify(payload);
}

export function serializeGroupControlPayload(
  input: Omit<GroupControlPayload, "v" | "t">,
): string {
  const payload: GroupControlPayload = {
    v: 1,
    t: "group_control",
    event: input.event,
    actorUserId: input.actorUserId,
  };
  if (input.subjectUserId) payload.subjectUserId = input.subjectUserId;
  if (input.name) payload.name = input.name;
  return JSON.stringify(payload);
}

export function serializeMediaPayload(payload: MediaPayload): string {
  return JSON.stringify(payload);
}

export function serializeReactionPayload(input: {
  op: ReactionOp;
  targetServerEnvelopeId: string;
  emoji: string;
}): string {
  const payload: ReactionPayload = {
    v: 1,
    t: "reaction",
    op: input.op,
    targetServerEnvelopeId: input.targetServerEnvelopeId,
    emoji: input.emoji,
  };
  return JSON.stringify(payload);
}

export function parseSignalPlaintext(plaintext: string): ParsedSignalPlaintext {
  const trimmed = plaintext.trim();
  if (!trimmed.startsWith("{")) {
    return { kind: "legacy-text", text: plaintext };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    return { kind: "legacy-text", text: plaintext };
  }
  if (!isRecord(raw) || raw.v !== 1) {
    return { kind: "legacy-text", text: plaintext };
  }
  if (raw.t === "text" && typeof raw.text === "string") {
    const textPayload: TextPayload = { v: 1, t: "text", text: raw.text };
    if (typeof raw.clientMessageId === "string" && raw.clientMessageId.length > 0) {
      textPayload.clientMessageId = raw.clientMessageId;
    }
    return { kind: "text", payload: textPayload };
  }
  if (raw.t === "media") {
    const media = parseMediaPayload(raw);
    if (media) return { kind: "media", payload: media };
  }
  if (raw.t === "reaction") {
    const reaction = parseReactionPayload(raw);
    if (reaction) return { kind: "reaction", payload: reaction };
  }
  if (raw.t === "receipt") {
    const receipt = parseReceiptPayload(raw);
    if (receipt) return { kind: "receipt", payload: receipt };
  }
  if (raw.t === "group_control") {
    const control = parseGroupControlPayload(raw);
    if (control) return { kind: "group_control", payload: control };
  }
  return { kind: "legacy-text", text: plaintext };
}

export function parseMediaPayload(raw: Record<string, unknown>): MediaPayload | null {
  if (raw.t !== "media" || raw.v !== 1) return null;
  if (raw.kind !== "voice" && raw.kind !== "video") return null;
  if (raw.algorithm !== MEDIA_ALGORITHM) return null;
  if (typeof raw.attachmentId !== "string" || raw.attachmentId.length < 8) return null;
  if (!isPositiveInt(raw.size) || raw.size > MAX_ATTACHMENT_BYTES) return null;
  if (!isPositiveInt(raw.chunkSize) || raw.chunkSize > MAX_ATTACHMENT_BYTES) return null;
  if (!isPositiveInt(raw.chunkCount) || raw.chunkCount > 1_000_000) return null;
  if (typeof raw.mimeType !== "string" || raw.mimeType.length === 0) return null;
  if (typeof raw.key !== "string" || typeof raw.noncePrefix !== "string") return null;

  const expectedChunks = Math.ceil(raw.size / raw.chunkSize);
  if (raw.chunkCount !== expectedChunks) return null;

  let key: Uint8Array;
  let noncePrefix: Uint8Array;
  try {
    key = base64UrlToBytes(raw.key);
    noncePrefix = base64UrlToBytes(raw.noncePrefix);
  } catch {
    return null;
  }
  if (key.length !== MEDIA_KEY_BYTES) return null;
  if (noncePrefix.length !== MEDIA_NONCE_PREFIX_BYTES) return null;

  const payload: MediaPayload = {
    v: 1,
    t: "media",
    kind: raw.kind,
    attachmentId: raw.attachmentId,
    algorithm: MEDIA_ALGORITHM,
    size: raw.size,
    chunkSize: raw.chunkSize,
    chunkCount: raw.chunkCount,
    mimeType: raw.mimeType,
    key: raw.key,
    noncePrefix: raw.noncePrefix,
  };
  if (isOptionalInt(raw.durationMs)) payload.durationMs = raw.durationMs;
  if (isOptionalInt(raw.width)) payload.width = raw.width;
  if (isOptionalInt(raw.height)) payload.height = raw.height;
  if (typeof raw.fileName === "string") payload.fileName = raw.fileName;
  if (typeof raw.caption === "string") payload.caption = raw.caption;
  if (typeof raw.clientMessageId === "string" && raw.clientMessageId.length > 0) {
    payload.clientMessageId = raw.clientMessageId;
  }
  return payload;
}

export function parseReactionPayload(
  raw: Record<string, unknown>,
): ReactionPayload | null {
  if (raw.t !== "reaction" || raw.v !== 1) return null;
  if (raw.op !== "add" && raw.op !== "remove") return null;
  if (
    typeof raw.targetServerEnvelopeId !== "string" ||
    raw.targetServerEnvelopeId.length < 8
  ) {
    return null;
  }
  if (typeof raw.emoji !== "string" || raw.emoji.length === 0 || raw.emoji.length > 32) {
    return null;
  }
  return {
    v: 1,
    t: "reaction",
    op: raw.op,
    targetServerEnvelopeId: raw.targetServerEnvelopeId,
    emoji: raw.emoji,
  };
}

export function parseReceiptPayload(
  raw: Record<string, unknown>,
): ReceiptPayload | null {
  if (raw.t !== "receipt" || raw.v !== 1) return null;
  if (!Array.isArray(raw.messageIds) || raw.messageIds.length === 0) return null;
  if (raw.messageIds.length > 100) return null;
  const messageIds: string[] = [];
  for (const id of raw.messageIds) {
    if (typeof id !== "string" || id.length < 8 || id.length > 128) return null;
    messageIds.push(id);
  }
  const out: ReceiptPayload = { v: 1, t: "receipt", messageIds };
  if (raw.kind === "delivered" || raw.kind === "read") out.kind = raw.kind;
  if (typeof raw.groupId === "string") out.groupId = raw.groupId;
  return out;
}

export function parseGroupControlPayload(
  raw: Record<string, unknown>,
): GroupControlPayload | null {
  if (raw.t !== "group_control" || raw.v !== 1) return null;
  if (typeof raw.actorUserId !== "string") return null;
  const event = raw.event;
  if (
    event !== "added" &&
    event !== "removed" &&
    event !== "left" &&
    event !== "renamed"
  ) {
    return null;
  }
  const out: GroupControlPayload = {
    v: 1,
    t: "group_control",
    event,
    actorUserId: raw.actorUserId,
  };
  if (typeof raw.subjectUserId === "string") out.subjectUserId = raw.subjectUserId;
  if (typeof raw.name === "string") out.name = raw.name;
  return out;
}

export function mediaPreviewLabel(kind: MediaKind): string {
  return kind === "voice" ? "Voice message" : "Video message";
}

export function encodeMediaKey(key: Uint8Array): string {
  return bytesToBase64Url(key);
}

export function encodeNoncePrefix(noncePrefix: Uint8Array): string {
  return bytesToBase64Url(noncePrefix);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isOptionalInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}
