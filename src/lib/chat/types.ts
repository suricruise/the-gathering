export type Attachment = {
  id: string;
  filename: string;
  mime: string;
  kind: "photo" | "gif" | "file";
  byte_size: number;
};
export type LinkPreview = {
  url: string;
  title: string;
  description: string;
  hostname: string;
};
export type ChatMessage = {
  id: string;
  channel_id: string;
  author_id: string | null;
  author_name: string;
  author_avatar: boolean;
  parent_id: string | null;
  reply_to_id: string | null;
  body: string;
  created_at: string;
  edited_at: string | null;
  pinned_at?: string | null;
  deleted_at: string | null;
  created_seq: string;
  version: string;
  reply_count: number;
  thread_latest_at?: string | null;
  read_count: number;
  reactions: { emoji: string; count: number; mine: boolean }[];
  attachments: Attachment[];
  previews: LinkPreview[];
};
export type ChatPage = {
  messages: ChatMessage[];
  watermark: string;
  last_read_seq: string;
  unread_count: number;
  first_unread_id?: string | null;
  has_older?: boolean;
  has_newer?: boolean;
  latest_seq?: string;
};
export type ChatResult<T> = { data?: T; error?: string; denied?: boolean; delivery?: "sent" | "not_sent" | "unconfirmed" };
export const reactionEmoji = [
  "👍",
  "❤️",
  "😂",
  "🎉",
  "🙏",
  "🔥",
  "👀",
  "✅",
] as const;

export type ThreadPage = ChatPage & { root: ChatMessage };

export type ChatState = Pick<ChatPage, "watermark" | "last_read_seq" | "unread_count">;
export type PendingMessage = { id: string; channelId: string; parentId: string | null; replyToId: string | null; body: string; attachments: Attachment[]; status: "sending" | "failed"; error?: string };
export type DeliveryChange = { type: "start"; message: PendingMessage } | { type: "failed"; id: string; error: string } | { type: "settled" | "discard"; id: string };
