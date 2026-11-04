import { describe, expect, test } from "vitest";

import type { LocalMessage } from "@/lib/db/types";

import {
  appendOlderMessages,
  mergeMessagesById,
  sortMessagesOldestFirst,
} from "./merge-messages";

function msg(
  id: string,
  createdAt: number,
  status: LocalMessage["status"] = "sent",
): LocalMessage {
  return {
    id,
    clientId: `c_${id}`,
    conversationId: "conv",
    direction: "outgoing",
    kind: "text",
    plaintext: id,
    status,
    senderDeviceId: "d1",
    createdAt,
  };
}

describe("sortMessagesOldestFirst", () => {
  test("orders by createdAt asc", () => {
    const out = sortMessagesOldestFirst([
      msg("a", 1),
      msg("c", 3),
      msg("b", 2),
    ]);
    expect(out.map((m) => m.id)).toEqual(["a", "b", "c"]);
  });
});

describe("mergeMessagesById", () => {
  test("dedupes and prefers incoming status", () => {
    const existing = [msg("a", 1, "pending"), msg("b", 2, "sent")];
    const incoming = [msg("b", 2, "delivered"), msg("c", 3, "sent")];
    const out = mergeMessagesById(incoming, existing);
    expect(out.map((m) => m.id)).toEqual(["a", "b", "c"]);
    expect(out.find((m) => m.id === "b")?.status).toBe("delivered");
  });
});

describe("appendOlderMessages", () => {
  test("prepends older without duplicates", () => {
    const existing = [msg("b", 20), msg("c", 30)];
    const older = [msg("b", 20), msg("a", 10)];
    const out = appendOlderMessages(existing, older);
    expect(out.map((m) => m.id)).toEqual(["a", "b", "c"]);
  });

  test("no-op when older empty or all dupes", () => {
    const existing = [msg("a", 1)];
    expect(appendOlderMessages(existing, [])).toBe(existing);
    expect(appendOlderMessages(existing, [msg("a", 1)])).toBe(existing);
  });
});
