export type SocialMedia = {
  id: string;
  filename: string;
  mime: string;
  kind: "photo" | "gif" | "video";
  byte_size: number;
};
export type SocialPost = {
  id: string;
  seq: string;
  author_id: string | null;
  author_name: string;
  username: string | null;
  avatar: boolean;
  body: string;
  audience: "members" | "followers" | "community" | "private";
  community_id: string | null;
  community_name: string | null;
  community_slug: string | null;
  game_tags: string[];
  interest_tags: string[];
  status: "published" | "hidden" | "removed";
  created_at: string;
  edited_at: string | null;
  can_moderate: boolean;
  following: boolean;
  media: SocialMedia[];
  reactions: { emoji: string; count: number; mine: boolean }[];
  comment_count: number;
  previews: {
    url: string;
    title: string;
    description: string;
    hostname: string;
  }[];
};
export type SocialComment = {
  id: string;
  seq: string;
  post_id: string;
  author_id: string | null;
  author_name: string;
  avatar: boolean;
  body: string;
  status: string;
  created_at: string;
  edited_at: string | null;
};
export type SocialPage<T> = { items: T[]; next: string | null };
export type SocialReport = {
  id: string;
  seq: string;
  post_id: string;
  comment_id: string | null;
  reason: string;
  detail: string;
  status: string;
  created_at: string;
  can_moderate: boolean;
  post: SocialPost | null;
  comment_body: string | null;
};
export type SocialOptions = {
  communities: { id: string; name: string }[];
  games: { id: string; name: string }[];
};
export type SocialResult<T> =
  { data: T; error?: never } | { data?: never; error: string };
