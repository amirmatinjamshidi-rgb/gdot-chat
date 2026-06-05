import type { IDatabase } from "./database-types";

export type LocalProfile = {
  displayName: string;
  bio: string;
  phoneE164: string;
  birthday: string;
};

export interface IProfileStore {
  get(): Promise<LocalProfile>;
  save(profile: Partial<LocalProfile>): Promise<void>;
  reset(): Promise<void>;
}

const EMPTY: LocalProfile = {
  displayName: "",
  bio: "",
  phoneE164: "",
  birthday: "",
};

type ProfileRow = {
  display_name: string;
  bio: string;
  phone_e164: string;
  birthday: string;
};

export class ProfileStore implements IProfileStore {
  constructor(private readonly db: IDatabase) {}

  async get(): Promise<LocalProfile> {
    const row = await this.db.getFirst<ProfileRow>(
      `SELECT display_name, bio, phone_e164, birthday FROM local_profile WHERE id = 1`,
    );
    if (!row) return { ...EMPTY };
    return {
      displayName: row.display_name,
      bio: row.bio,
      phoneE164: row.phone_e164,
      birthday: row.birthday,
    };
  }

  async save(profile: Partial<LocalProfile>): Promise<void> {
    const current = await this.get();
    const next = { ...current, ...profile };
    await this.db.run(
      `INSERT OR REPLACE INTO local_profile (id, display_name, bio, phone_e164, birthday)
       VALUES (1, ?, ?, ?, ?)`,
      [next.displayName, next.bio, next.phoneE164, next.birthday],
    );
  }

  async reset(): Promise<void> {
    await this.save(EMPTY);
  }
}
