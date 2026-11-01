import { describe, expect, it } from "vitest";

import { isPublicRoute } from "@/lib/auth/public-routes";

describe("isPublicRoute", () => {
  it("allows auth PIN setup without forcing /lock", () => {
    expect(isPublicRoute("/(auth)/set-app-pin")).toBe(true);
    expect(isPublicRoute("/set-app-pin")).toBe(true);
    expect(isPublicRoute("/(auth)/register")).toBe(true);
    expect(isPublicRoute("/register")).toBe(true);
    expect(isPublicRoute("/(auth)/login")).toBe(true);
  });

  it("does not treat chats as public", () => {
    expect(isPublicRoute("/(tabs)/chats")).toBe(false);
    expect(isPublicRoute("/chats")).toBe(false);
  });
});
