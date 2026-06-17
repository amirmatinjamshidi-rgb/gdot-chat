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

/** First row in the picker (7 slots); last slot opens the full emoji sheet. */
export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥", "➕"] as const;

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
