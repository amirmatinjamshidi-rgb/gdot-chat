import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const watched = [
  "api/api-client.ts",
  "api/http-fetch.ts",
  "api/signalr-client.ts",
  "session/sync-service.ts",
  "crypto/signal-service.ts",
  "providers/app-lock-provider.tsx",
];

describe("debug agent log gated away (E2E source)", () => {
  it.each(watched)("%s has no debug exfil hooks", (rel) => {
    const src = readFileSync(path.resolve(__dirname, rel), "utf8");
    expect(src).not.toMatch(/agentDebugLog/);
    expect(src).not.toMatch(/#region agent/);
    expect(src).not.toMatch(/7859/);
  });
});
