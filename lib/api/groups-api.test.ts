import { describe, expect, it, vi } from "vitest";

import { GroupsApi } from "@/lib/api/groups-api";

describe("GroupsApi.listMine", () => {
  it("requests first page without query when no opts", async () => {
    const get = vi.fn(async () => ({
      items: [],
      nextCursor: null,
    }));
    const api = new GroupsApi({ get } as never);
    await api.listMine();
    expect(get).toHaveBeenCalledWith("/groups");
  });

  it("passes limit and after as query params", async () => {
    const get = vi.fn(async () => ({
      items: [{ id: "g1" }],
      nextCursor: "abc",
    }));
    const api = new GroupsApi({ get } as never);
    const page = await api.listMine({ limit: 50, after: "cur" });
    expect(get).toHaveBeenCalledWith("/groups?limit=50&after=cur");
    expect(page.nextCursor).toBe("abc");
    expect(page.items).toHaveLength(1);
  });
});
