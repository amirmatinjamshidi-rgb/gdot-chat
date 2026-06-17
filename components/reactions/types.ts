export type Reaction = {
  emoji: string;
  users: string[];
  count: number;
};

export type ReactionPayload = {
  messageId: string;
  conversationId: string;
  emoji: string;
  userId: string;
  recipientDeviceId: string;
  serverEnvelopeId?: string;
};

export const QUICK_REACTIONS = [
  "👍",
  "❤️",
  "😂",
  "😮",
  "😢",
  "🔥",
  "😭",
] as const;

export const ALL_REACTIONS = [
  "👍",
  "👎",
  "❤️",
  "🔥",
  "🥰",
  "👏",
  "😁",
  "🤔",
  "🤯",
  "😢",
  "🎉",
  "🤩",
  "🤮",
  "💩",
  "🙏",
  "👌",
  "🕊️",
  "🤡",
  "🥱",
  "🥴",
  "➕",
  "😍",
  "🐳",
  "❤️‍🔥",
  "🌚",
  "🌭",
  "💯",
  "🤣",
  "⚡",
  "🍌",
  "🏆",
  "💔",
  "🤨",
  "😐",
  "🍓",
  "🍾",
  "💋",
  "🖕",
  "😈",
  "😴",
  "😭",
  "🤓",
  "👻",
  "👨‍💻",
  "👀",
  "🎃",
  "🙈",
  "😇",
  "😨",
  "🤝",
  "✍️",
  "🤗",
  "🫡",
  "🎅",
  "🎄",
  "☃️",
  "💅",
  "🤪",
  "🗿",
  "🆒",
  "💘",
  "🙉",
  "🦄",
  "😘",
  "💊",
  "🙊",
  "😎",
  "👾",
  "🤷‍♂️",
  "🤷",
  "🤷‍♀️",
  "😡",
] as const;
