import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { resolveApiBaseUrl } from "@/lib/config/api-base-url";

describe("API URL configuration (E2E source checks)", () => {
  it("config source has no hardcoded 192.168 fallback", () => {
    const src = readFileSync(path.resolve(__dirname, "config.ts"), "utf8");
    const resolver = readFileSync(
      path.resolve(__dirname, "config/api-base-url.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/192\.168\.\d+\.\d+/);
    expect(resolver).not.toMatch(/192\.168\.\d+\.\d+/);
    expect(resolver).toMatch(/EXPO_PUBLIC_API_URL/);
  });

  it("env example documents EXPO_PUBLIC_API_URL only", () => {
    const envExample = readFileSync(
      path.resolve(__dirname, "../.env.example"),
      "utf8",
    );
    expect(envExample).toMatch(/EXPO_PUBLIC_API_URL=/);
    expect(envExample).not.toMatch(/192\.168\.0\.177/);
  });

  it("resolves from expo extra when env empty", () => {
    const randomHost = `http://127.0.0.1:${10000 + Math.floor(Math.random() * 50000)}/v1`;
    expect(
      resolveApiBaseUrl(
        { EXPO_PUBLIC_API_URL: "" },
        randomHost,
      ),
    ).toBe(randomHost);
  });
});
