import type { ApiClient } from "@/lib/api/api-client";

export type GroupSummary = {
  id: string;
  encryptedMetadataBase64: string | null;
  createdByUserId: string;
  createdAt: string;
  memberCount: number;
  myRole: string;
};

export type GroupMember = {
  userId: string;
  username: string;
  role: string;
  joinedAt: string;
  leftAt: string | null;
};

export type SendGroupMessageResult = {
  groupId: string;
  fanOutCount: number;
  envelopeIds: string[];
};

export class GroupsApi {
  constructor(private readonly api: ApiClient) {}

  create(body: {
    memberUserIds: string[];
    encryptedMetadataBase64?: string | null;
  }): Promise<GroupSummary> {
    return this.api.post<GroupSummary>("/groups", {
      memberUserIds: body.memberUserIds,
      encryptedMetadataBase64: body.encryptedMetadataBase64 ?? null,
    });
  }

  listMine(): Promise<GroupSummary[]> {
    return this.api.get<GroupSummary[]>("/groups");
  }

  listMembers(groupId: string): Promise<GroupMember[]> {
    return this.api.get<GroupMember[]>(`/groups/${groupId}/members`);
  }

  addMembers(groupId: string, userIds: string[]): Promise<void> {
    return this.api.post<void>(`/groups/${groupId}/members`, { userIds });
  }

  removeMember(groupId: string, userId: string): Promise<void> {
    return this.api.post<void>(`/groups/${groupId}/members/remove`, {
      userId,
    });
  }

  leave(groupId: string): Promise<void> {
    return this.api.post<void>(`/groups/${groupId}/leave`);
  }

  send(
    groupId: string,
    body: { messageType: number; ciphertextBase64: string },
  ): Promise<SendGroupMessageResult> {
    return this.api.postPriority<SendGroupMessageResult>(
      `/groups/${groupId}/messages`,
      body,
    );
  }
}
