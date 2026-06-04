/** First 1–2 graphemes for avatar initials. */
export function usernameToInitials(username: string): string {
  const clean = username.trim();
  if (!clean) return "?";
  const parts = clean.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  const word = parts[0] ?? clean;
  return word.slice(0, 2).toUpperCase();
}

export function formatUsernameAt(username: string): string {
  const u = username.trim();
  if (!u) return "@—";
  return u.startsWith("@") ? u : `@${u}`;
}

export function shortId(id: string, head = 8, tail = 4): string {
  if (!id) return "—";
  if (id.length <= head + tail + 1) return id;
  return `${id.slice(0, head)}…${id.slice(-tail)}`;
}

export function formatMemberSince(timestampMs?: number): string {
  if (!timestampMs) return "—";
  return new Date(timestampMs).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function displayNameFromUsername(username: string): string {
  const u = username.trim();
  if (!u) return "User";
  return u
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}
