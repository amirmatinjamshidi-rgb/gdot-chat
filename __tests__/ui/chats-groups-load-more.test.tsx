import React from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import ChatsScreen from "@/app/(tabs)/chats";
import { mockAppServices, randomId, renderWithServices } from "./helpers";

describe("ChatsScreen group list pagination", () => {
  it("calls listMine with after cursor when FlatList reaches end", async () => {
    const g1 = randomId("g");
    const g2 = randomId("g");
    const listMine = jest
      .fn()
      .mockResolvedValueOnce({
        items: [
          {
            id: g1,
            encryptedMetadataBase64: null,
            createdByUserId: randomId("u"),
            createdAt: "2026-11-04T12:00:00Z",
            memberCount: 2,
            myRole: "admin",
          },
        ],
        nextCursor: "cursor-1",
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: g2,
            encryptedMetadataBase64: null,
            createdByUserId: randomId("u"),
            createdAt: "2026-11-01T12:00:00Z",
            memberCount: 2,
            myRole: "member",
          },
        ],
        nextCursor: null,
      });

    const services = mockAppServices({
      groupsApi: { listMine } as never,
      conversationStore: {
        listAll: jest.fn(async () => []),
      } as never,
    });

    renderWithServices(<ChatsScreen />, services);

    await waitFor(() => {
      expect(screen.getByText(`Group ${g1.slice(0, 8)}`)).toBeTruthy();
    });
    expect(listMine).toHaveBeenCalledWith({ limit: 50 });

    // FlatList in the tree — fire onEndReached on the list.
    const list = screen.UNSAFE_getByType(
      require("react-native").FlatList,
    );
    fireEvent(list, "onEndReached");

    await waitFor(() => {
      expect(listMine).toHaveBeenCalledWith({
        limit: 50,
        after: "cursor-1",
      });
    });
    await waitFor(() => {
      expect(screen.getByText(`Group ${g2.slice(0, 8)}`)).toBeTruthy();
    });
  });
});
