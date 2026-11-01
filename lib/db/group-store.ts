import type { IDatabase } from "./database-types";

export type LocalGroup = {
  id: string;
  encryptedMetadata: string | null;
  createdByUserId: string;
  createdAt: number;
  myRole: string;
  lastMessagePreview: string;
  lastMessageAt: number;
  unreadCount: number;
};

export type LocalGroupMember = {
  groupId: string;
  userId: string;
  username: string;
  role: string;
  joinedAt: number;
  leftAt: number | null;
};

export interface IGroupStore {
  upsertGroup(group: LocalGroup): Promise<void>;
  getGroup(id: string): Promise<LocalGroup | null>;
  listGroups(): Promise<LocalGroup[]>;
  upsertMember(member: LocalGroupMember): Promise<void>;
  listMembers(groupId: string, activeOnly?: boolean): Promise<LocalGroupMember[]>;
  markMemberLeft(groupId: string, userId: string, leftAt: number): Promise<void>;
  touchPreview(groupId: string, preview: string, at: number): Promise<void>;
}

type GroupRow = {
  id: string;
  encrypted_metadata: string | null;
  created_by_user_id: string;
  created_at: number;
  my_role: string;
  last_message_preview: string;
  last_message_at: number;
  unread_count: number;
};

type MemberRow = {
  group_id: string;
  user_id: string;
  username: string;
  role: string;
  joined_at: number;
  left_at: number | null;
};

function mapGroup(r: GroupRow): LocalGroup {
  return {
    id: r.id,
    encryptedMetadata: r.encrypted_metadata,
    createdByUserId: r.created_by_user_id,
    createdAt: r.created_at,
    myRole: r.my_role,
    lastMessagePreview: r.last_message_preview,
    lastMessageAt: r.last_message_at,
    unreadCount: r.unread_count,
  };
}

function mapMember(r: MemberRow): LocalGroupMember {
  return {
    groupId: r.group_id,
    userId: r.user_id,
    username: r.username,
    role: r.role,
    joinedAt: r.joined_at,
    leftAt: r.left_at,
  };
}

export class GroupStore implements IGroupStore {
  constructor(private readonly db: IDatabase) {}

  async upsertGroup(group: LocalGroup): Promise<void> {
    await this.db.run(
      `INSERT INTO local_groups (
         id, encrypted_metadata, created_by_user_id, created_at, my_role,
         last_message_preview, last_message_at, unread_count
       ) VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         encrypted_metadata=excluded.encrypted_metadata,
         my_role=excluded.my_role,
         last_message_preview=excluded.last_message_preview,
         last_message_at=excluded.last_message_at,
         unread_count=excluded.unread_count`,
      [
        group.id,
        group.encryptedMetadata,
        group.createdByUserId,
        group.createdAt,
        group.myRole,
        group.lastMessagePreview,
        group.lastMessageAt,
        group.unreadCount,
      ],
    );
  }

  async getGroup(id: string): Promise<LocalGroup | null> {
    const row = await this.db.getFirst<GroupRow>(
      `SELECT * FROM local_groups WHERE id=?`,
      [id],
    );
    return row ? mapGroup(row) : null;
  }

  async listGroups(): Promise<LocalGroup[]> {
    const rows = await this.db.getAll<GroupRow>(
      `SELECT * FROM local_groups ORDER BY last_message_at DESC, created_at DESC`,
    );
    return rows.map(mapGroup);
  }

  async upsertMember(member: LocalGroupMember): Promise<void> {
    await this.db.run(
      `INSERT INTO local_group_members (
         group_id, user_id, username, role, joined_at, left_at
       ) VALUES (?,?,?,?,?,?)
       ON CONFLICT(group_id, user_id) DO UPDATE SET
         username=excluded.username,
         role=excluded.role,
         joined_at=excluded.joined_at,
         left_at=excluded.left_at`,
      [
        member.groupId,
        member.userId,
        member.username,
        member.role,
        member.joinedAt,
        member.leftAt,
      ],
    );
  }

  async listMembers(
    groupId: string,
    activeOnly = true,
  ): Promise<LocalGroupMember[]> {
    const rows = activeOnly
      ? await this.db.getAll<MemberRow>(
          `SELECT * FROM local_group_members WHERE group_id=? AND left_at IS NULL ORDER BY joined_at ASC`,
          [groupId],
        )
      : await this.db.getAll<MemberRow>(
          `SELECT * FROM local_group_members WHERE group_id=? ORDER BY joined_at ASC`,
          [groupId],
        );
    return rows.map(mapMember);
  }

  async markMemberLeft(
    groupId: string,
    userId: string,
    leftAt: number,
  ): Promise<void> {
    await this.db.run(
      `UPDATE local_group_members SET left_at=? WHERE group_id=? AND user_id=?`,
      [leftAt, groupId, userId],
    );
  }

  async touchPreview(groupId: string, preview: string, at: number): Promise<void> {
    const g = await this.getGroup(groupId);
    if (!g) return;
    await this.upsertGroup({
      ...g,
      lastMessagePreview: preview.slice(0, 120),
      lastMessageAt: at,
    });
  }
}

export class MemoryGroupStore implements IGroupStore {
  private groups = new Map<string, LocalGroup>();
  private members = new Map<string, LocalGroupMember>();

  private mk(groupId: string, userId: string) {
    return `${groupId}|${userId}`;
  }

  async upsertGroup(group: LocalGroup): Promise<void> {
    this.groups.set(group.id, { ...group });
  }
  async getGroup(id: string): Promise<LocalGroup | null> {
    return this.groups.get(id) ?? null;
  }
  async listGroups(): Promise<LocalGroup[]> {
    return [...this.groups.values()].sort(
      (a, b) => b.lastMessageAt - a.lastMessageAt || b.createdAt - a.createdAt,
    );
  }
  async upsertMember(member: LocalGroupMember): Promise<void> {
    this.members.set(this.mk(member.groupId, member.userId), { ...member });
  }
  async listMembers(groupId: string, activeOnly = true): Promise<LocalGroupMember[]> {
    return [...this.members.values()]
      .filter((m) => m.groupId === groupId && (!activeOnly || m.leftAt == null))
      .sort((a, b) => a.joinedAt - b.joinedAt);
  }
  async markMemberLeft(groupId: string, userId: string, leftAt: number): Promise<void> {
    const m = this.members.get(this.mk(groupId, userId));
    if (m) this.members.set(this.mk(groupId, userId), { ...m, leftAt });
  }

  async touchPreview(groupId: string, preview: string, at: number): Promise<void> {
    const g = this.groups.get(groupId);
    if (!g) return;
    this.groups.set(groupId, {
      ...g,
      lastMessagePreview: preview.slice(0, 120),
      lastMessageAt: at,
    });
  }
}
