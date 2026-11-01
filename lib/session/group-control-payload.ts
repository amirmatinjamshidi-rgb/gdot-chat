/** Control plaintext carried over 1:1 Signal sessions for Sender Keys. */

export type SenderKeyRequestWire = {
  v: 1;
  t: "sender_key_request";
  groupId: string;
  requesterUserId: string;
  requesterDeviceId: string;
};

export function serializeSenderKeyRequest(args: {
  groupId: string;
  requesterUserId: string;
  requesterDeviceId: string;
}): string {
  const wire: SenderKeyRequestWire = {
    v: 1,
    t: "sender_key_request",
    groupId: args.groupId,
    requesterUserId: args.requesterUserId,
    requesterDeviceId: args.requesterDeviceId,
  };
  return JSON.stringify(wire);
}

export function parseSenderKeyRequest(
  plaintext: string,
): SenderKeyRequestWire | null {
  try {
    const j = JSON.parse(plaintext) as Partial<SenderKeyRequestWire>;
    if (j.v !== 1 || j.t !== "sender_key_request") return null;
    if (
      typeof j.groupId !== "string" ||
      typeof j.requesterUserId !== "string" ||
      typeof j.requesterDeviceId !== "string"
    ) {
      return null;
    }
    return j as SenderKeyRequestWire;
  } catch {
    return null;
  }
}

export type GroupSystemEvent = "added" | "removed" | "left";

export function formatGroupSystemMessage(
  change: GroupSystemEvent,
  actorLabel: string,
  subjectLabel?: string | null,
): string {
  switch (change) {
    case "added":
      return subjectLabel
        ? `${actorLabel} added ${subjectLabel}`
        : `${actorLabel} added a member`;
    case "removed":
      return subjectLabel
        ? `${actorLabel} removed ${subjectLabel}`
        : `${actorLabel} removed a member`;
    case "left":
      return `${actorLabel} left the group`;
    default:
      return `Group updated`;
  }
}
