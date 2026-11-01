import { describe, expect, it } from "vitest";

import {
  classifyDecryptError,
  shouldRequestSessionReset,
} from "./classify-decrypt-error";

describe("classifyDecryptError", () => {
  it("marks keyChanged decrypt failures as needs_user", () => {
    expect(
      classifyDecryptError(new Error("Bad MAC"), { keyChanged: true }),
    ).toBe("needs_user");
  });

  it("classifies lock/KEK/media/network as transient", () => {
    expect(classifyDecryptError(new Error("database is locked"))).toBe(
      "transient",
    );
    expect(classifyDecryptError(new Error("KEK_MISSING"))).toBe("transient");
    expect(
      classifyDecryptError(new Error("Media transfer is not initialized")),
    ).toBe("transient");
    expect(classifyDecryptError(new Error("Failed to fetch"))).toBe("transient");
  });

  it("classifies duplicate/corrupt/session/prekey as permanent", () => {
    expect(classifyDecryptError(new Error("Duplicate message"))).toBe(
      "permanent",
    );
    expect(classifyDecryptError(new Error("Bad MAC"))).toBe("permanent");
    expect(classifyDecryptError(new Error("No valid sessions"))).toBe(
      "permanent",
    );
    expect(classifyDecryptError(new Error("PreKey not found"))).toBe(
      "permanent",
    );
  });

  it("shouldRequestSessionReset only for session/prekey style errors", () => {
    expect(shouldRequestSessionReset(new Error("No session"))).toBe(true);
    expect(shouldRequestSessionReset(new Error("Duplicate message"))).toBe(
      false,
    );
  });
});
