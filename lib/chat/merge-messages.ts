import type { LocalMessage } from "@/lib/db/types";

/** Oldest-first by createdAt; stable id tie-break. FlashList v2 chat (bottom-anchored). */
export function sortMessagesOldestFirst(
  messages: LocalMessage[],
): LocalMessage[] {
  return [...messages].sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** @deprecated alias — prefer sortMessagesOldestFirst */
export const sortMessagesNewestFirst = sortMessagesOldestFirst;

/**
 * Merge a fresh newest page into an existing list.
 * Prefer the newer object for the same id (status / attachment updates).
 * Result is oldest-first, deduped.
 */
export function mergeMessagesById(
  incoming: LocalMessage[],
  existing: LocalMessage[],
): LocalMessage[] {
  const map = new Map<string, LocalMessage>();
  for (const m of existing) map.set(m.id, m);
  for (const m of incoming) map.set(m.id, m);
  return sortMessagesOldestFirst([...map.values()]);
}

/**
 * Prepend an older page (created_at < oldest existing) without dupes.
 * `older` may arrive newest-first from SQL; we sort into oldest-first.
 */
export function appendOlderMessages(
  existing: LocalMessage[],
  older: LocalMessage[],
): LocalMessage[] {
  if (older.length === 0) return existing;
  const seen = new Set(existing.map((m) => m.id));
  const extra = older.filter((m) => !seen.has(m.id));
  if (extra.length === 0) return existing;
  return sortMessagesOldestFirst([...extra, ...existing]);
}
