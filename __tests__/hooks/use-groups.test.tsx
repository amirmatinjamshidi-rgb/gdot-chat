import { act, renderHook, waitFor } from "@testing-library/react-native";

import { useGroups } from "@/hooks/use-groups";
import { useAppServices } from "@/lib/services/app-services-context";

jest.mock("@/lib/services/app-services-context", () => ({
  useAppServices: jest.fn(),
}));

const listMine = jest.fn();

describe("useGroups", () => {
  beforeEach(() => {
    listMine.mockReset();
    (useAppServices as jest.Mock).mockReturnValue({
      groupsApi: { listMine },
    });
  });

  it("loads first page then appends on loadMore with after cursor", async () => {
    listMine
      .mockResolvedValueOnce({
        items: [
          {
            id: "g1",
            encryptedMetadataBase64: null,
            createdByUserId: "u",
            createdAt: "2026-11-04T12:00:00Z",
            memberCount: 2,
            myRole: "admin",
          },
        ],
        nextCursor: "c1",
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: "g2",
            encryptedMetadataBase64: null,
            createdByUserId: "u",
            createdAt: "2026-11-03T12:00:00Z",
            memberCount: 3,
            myRole: "member",
          },
        ],
        nextCursor: null,
      });

    const { result } = renderHook(() => useGroups());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.groups.map((g) => g.id)).toEqual(["g1"]);
    expect(result.current.hasMore).toBe(true);

    await act(async () => {
      await result.current.loadMore();
    });
    expect(result.current.groups.map((g) => g.id)).toEqual(["g1", "g2"]);
    expect(result.current.hasMore).toBe(false);
    expect(listMine).toHaveBeenNthCalledWith(2, {
      limit: 50,
      after: "c1",
    });
  });
});
