/** Pure outgoing delivery ticks shown next to message time. */
export function deliveryTicksForStatus(
  isMine: boolean,
  deliveryStatus: string | undefined,
): string {
  if (!isMine || !deliveryStatus) return "";
  if (deliveryStatus === "delivered") return " ✓✓";
  if (
    deliveryStatus === "sent" ||
    deliveryStatus === "pending" ||
    deliveryStatus === "sending"
  )
    return " ✓";
  if (deliveryStatus === "failed") return " !";
  return "";
}
