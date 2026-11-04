import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression: a crypto polyfill with getRandomValues but no subtle makes
 * libsignal skip msrcrypto and crash on subtle.importKey when starting a chat.
 */
describe("ensureWebCrypto", () => {
  let originalCrypto: Crypto;

  beforeEach(() => {
    originalCrypto = globalThis.crypto;
    vi.resetModules();
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "crypto", {
      value: originalCrypto,
      configurable: true,
      writable: true,
    });
    vi.resetModules();
  });

  it("installs subtle.importKey when crypto exists without subtle (Hermes bug)", async () => {
    const getRandomValues = originalCrypto.getRandomValues.bind(originalCrypto);
    Object.defineProperty(globalThis, "crypto", {
      value: { getRandomValues } as Crypto,
      configurable: true,
      writable: true,
    });

    expect(globalThis.crypto.subtle).toBeUndefined();

    const { ensureWebCrypto } = await import("./ensure-webcrypto");
    ensureWebCrypto();

    expect(typeof globalThis.crypto.subtle?.importKey).toBe("function");
    expect(typeof globalThis.crypto.getRandomValues).toBe("function");
  });

  it("installs both getRandomValues and subtle when crypto is missing", async () => {
    Object.defineProperty(globalThis, "crypto", {
      value: undefined,
      configurable: true,
      writable: true,
    });

    const { ensureWebCrypto } = await import("./ensure-webcrypto");
    ensureWebCrypto();

    expect(typeof globalThis.crypto?.getRandomValues).toBe("function");
    expect(typeof globalThis.crypto?.subtle?.importKey).toBe("function");
  });

  it("leaves an existing working subtle alone (Node/webcrypto path)", async () => {
    Object.defineProperty(globalThis, "crypto", {
      value: originalCrypto,
      configurable: true,
      writable: true,
    });
    const before = globalThis.crypto.subtle;

    const { ensureWebCrypto } = await import("./ensure-webcrypto");
    ensureWebCrypto();

    expect(globalThis.crypto.subtle).toBe(before);
  });
});
