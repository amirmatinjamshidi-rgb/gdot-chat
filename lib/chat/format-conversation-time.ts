/** Relative label for conversation list rows. */
export function formatConversationTime(timestampMs: number): string {
  if (!timestampMs) return "";

  const now = new Date();
  const then = new Date(timestampMs);
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const startOfThenDay = new Date(
    then.getFullYear(),
    then.getMonth(),
    then.getDate(),
  ).getTime();
  const dayDiff = Math.round((startOfToday - startOfThenDay) / 86_400_000);

  if (dayDiff === 0) {
    return then.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  if (dayDiff === 1) return "Yesterday";
  if (dayDiff < 7) {
    return then.toLocaleDateString(undefined, { weekday: "short" });
  }
  return then.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
