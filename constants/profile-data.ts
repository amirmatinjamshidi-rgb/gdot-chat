import avatarImage from "@/assets/images/freakyyahh.jpg";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type { ComponentProps } from "react";

export type ProfileAction = {
  id: string;
  title: string;
  value: string;
  icon: ComponentProps<typeof MaterialIcons>["name"];
  tone: "primary" | "success" | "warning";
};

export type SettingsItem = {
  id: string;
  title: string;
  subtitle: string;
  icon: ComponentProps<typeof MaterialIcons>["name"];
  value?: string;
  hasToggle?: boolean;
  enabled?: boolean;
};

export type SettingsSection = {
  id: string;
  title: string;
  items: SettingsItem[];
};

export const profile = {
  name: "AmirMatin",
  handle: "@BestNigga",
  status: "Available for secure chats",
  avatarInitials: "AM",
  avatarImage,
  phone: "+98 *** *** 2048",
  joinedAt: "Joined May 2026",
};

export const profileActions: ProfileAction[] = [
  {
    id: "contacts",
    title: "Contacts",
    value: "248",
    icon: "contacts",
    tone: "primary",
  },
  {
    id: "groups",
    title: "Groups",
    value: "18",
    icon: "groups",
    tone: "success",
  },
  {
    id: "channels",
    title: "Channels",
    value: "7",
    icon: "campaign",
    tone: "warning",
  },
];

export const settingsSections: SettingsSection[] = [
  {
    id: "account",
    title: "Account",
    items: [
      {
        id: "edit-profile",
        title: "Edit profile",
        subtitle: "Name, username, avatar, and bio",
        icon: "person",
      },
      {
        id: "privacy",
        title: "Privacy and safety",
        subtitle: "Blocked contacts, last seen, and calls",
        icon: "verified-user",
        value: "Strict",
      },
      {
        id: "devices",
        title: "Linked devices",
        subtitle: "Manage active sessions",
        icon: "devices",
        value: "2",
      },
    ],
  },
  {
    id: "experience",
    title: "Experience",
    items: [
      {
        id: "notifications",
        title: "Smart notifications",
        subtitle: "Mentions, calls, and priority chats",
        icon: "notifications",
        hasToggle: true,
        enabled: true,
      },
      {
        id: "fast-mode",
        title: "Fast mode",
        subtitle: "Reduce animations on slower devices",
        icon: "bolt",
        hasToggle: true,
        enabled: false,
      },
      {
        id: "appearance",
        title: "Appearance",
        subtitle: "Theme, wallpaper, and chat bubble style",
        icon: "palette",
        value: "System",
      },
    ],
  },
  {
    id: "media",
    title: "Media and storage",
    items: [
      {
        id: "auto-download",
        title: "Auto-download media",
        subtitle: "Photos, videos, APKs, and files",
        icon: "download",
        value: "Wi-Fi",
      },
      {
        id: "voice-video",
        title: "Voice and video messages",
        subtitle: "Recording quality and playback",
        icon: "mic",
        value: "HD",
      },
    ],
  },
];
