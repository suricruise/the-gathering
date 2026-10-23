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
  deleted_at: string | null;
  created_seq: string;
  version: string;
  reply_count: number;
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
};
export type ChatResult<T> = { data?: T; error?: string; denied?: boolean };
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
