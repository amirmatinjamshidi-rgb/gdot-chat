import React from "react";
import { screen, userEvent, waitFor } from "@testing-library/react-native";

import CreateGroupScreen from "@/app/CreateGroup";
import { mockAppServices, randomId, renderWithServices } from "./helpers";

const expoRouter = jest.requireMock("expo-router") as {
  useRouter: () => { replace: jest.Mock; push: jest.Mock };
  router: { replace: jest.Mock; push: jest.Mock };
};

describe("CreateGroupScreen", () => {
  it("searches contacts, selects members, and creates a group", async () => {
    const username = `u_${randomId("n")}`;
    const userId = randomId("uid");
    const groupId = randomId("gid");
    const create = jest.fn(async () => ({
      id: groupId,
      encryptedMetadataBase64: null,
      createdByUserId: randomId("me"),
      createdAt: new Date().toISOString(),
      memberCount: 2,
      myRole: "admin",
    }));
    const search = jest.fn(async () => [{ id: userId, username }]);
    const upsertGroup = jest.fn(async () => undefined);
    const upsertMember = jest.fn(async () => undefined);

    const services = mockAppServices({
      usersApi: { search } as never,
      groupsApi: { create } as never,
      groupStore: { upsertGroup, upsertMember } as never,
      identityStore: {
        getLocalIdentity: jest.fn(async () => ({
          userId: randomId("me"),
          deviceId: randomId("dev"),
          username: "me",
        })),
      } as never,
      groupSenderKeyService: {
        setLocalIdentity: jest.fn(),
        rotateOwnSenderKey: jest.fn(async () => undefined),
      } as never,
    });

    const user = userEvent.setup();
    renderWithServices(<CreateGroupScreen />, services);

    await user.type(screen.getByTestId("create-group-name"), "Trip");
    await user.type(
      screen.getByTestId("create-group-search"),
      username.slice(0, 4),
    );

    await waitFor(() => {
      expect(search).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByTestId(`pick-user-${username}`)).toBeTruthy();
    });
    await user.press(screen.getByTestId(`pick-user-${username}`));
    await user.press(screen.getByTestId("create-group-submit"));

    await waitFor(() => {
      expect(create).toHaveBeenCalled();
    });
    expect(upsertGroup).toHaveBeenCalled();
    expect(expoRouter.router.replace).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: "/GroupRoom",
        params: expect.objectContaining({ id: groupId }),
      }),
    );
  });
});
