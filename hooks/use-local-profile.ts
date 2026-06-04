import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useState } from "react";

import {
  displayNameFromUsername,
  formatMemberSince,
  formatUsernameAt,
  usernameToInitials,
} from "@/lib/profile/display";
import { useAppServices } from "@/lib/services/app-services-context";
import { useAuthStore } from "@/stores/auth-store";
import { useProfilePrefsStore } from "@/stores/profile-prefs-store";

export type LocalProfileView = {
  username: string;
  displayName: string;
  usernameAt: string;
  initials: string;
  userId: string;
  deviceId: string;
  registrationId: number | null;
  memberSince: string;
  conversationCount: number;
  bio: string;
  phoneE164: string;
  birthday: string;
  loading: boolean;
};

const EMPTY_VIEW: LocalProfileView = {
  username: "",
  displayName: "",
  usernameAt: "@—",
  initials: "?",
  userId: "",
  deviceId: "",
  registrationId: null,
  memberSince: "—",
  conversationCount: 0,
  bio: "",
  phoneE164: "",
  birthday: "",
  loading: true,
};

export function useLocalProfile(): LocalProfileView {
  const { identityStore, conversationStore, authStore } = useAppServices();
  const prefs = useProfilePrefsStore();
  const legacyUser = useAuthStore((s) => s.user);
  const [view, setView] = useState<LocalProfileView>(EMPTY_VIEW);

  const reload = useCallback(async () => {
    try {
      const [identity, conversations, authUserId, authDeviceId] =
        await Promise.all([
          identityStore.getLocalIdentity(),
          conversationStore.listAll(),
          authStore.getUserId(),
          authStore.getDeviceId(),
        ]);

      const username = identity?.username ?? "";
      const displayName =
        prefs.displayName.trim() || displayNameFromUsername(username);
      const notSet = "Not set";
      const legacyPhone =
        legacyUser?.method === "phone" && legacyUser.identifier
          ? legacyUser.identifier
          : "";

      setView({
        username,
        displayName: displayName || "User",
        usernameAt: formatUsernameAt(username),
        initials: usernameToInitials(
          prefs.displayName.trim() || username || "?",
        ),
        userId: identity?.userId ?? authUserId ?? "",
        deviceId: identity?.deviceId ?? authDeviceId ?? "",
        registrationId: identity?.registrationId ?? null,
        memberSince: formatMemberSince(identity?.createdAt),
        conversationCount: conversations.length,
        bio: prefs.bio.trim() || notSet,
        phoneE164: prefs.phoneE164.trim() || legacyPhone || notSet,
        birthday: prefs.birthday.trim() || notSet,
        loading: false,
      });
    } catch {
      setView((prev) => ({ ...prev, loading: false }));
    }
  }, [
    identityStore,
    conversationStore,
    authStore,
    prefs.displayName,
    prefs.bio,
    prefs.phoneE164,
    prefs.birthday,
    legacyUser?.identifier,
    legacyUser?.method,
  ]);

  useFocusEffect(
    useCallback(() => {
      setView((prev) => ({ ...prev, loading: true }));
      void reload();
    }, [reload]),
  );

  return view;
}
