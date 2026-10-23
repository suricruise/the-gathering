export type Item = { id: string; name: string };
export type SquadOptions = {
  games: Item[];
  platforms: Item[];
  compatibility: {
    game_id: string;
    platform_id: string;
    crossplay_pool: string | null;
  }[];
  communities: (Item & { staff: boolean })[];
};
export type SquadMember = {
  id: string;
  name: string;
  avatar: boolean;
  platform: string;
  status: "accepted" | "pending" | "withdrawn" | "rejected" | "removed";
  host: boolean;
};
export type Squad = {
  id: string;
  seq: string;
  title: string;
  description: string;
  game_id: string;
  game_name: string;
  platform_id: string;
  platform_name: string;
  cross_play: boolean;
  play_style: "casual" | "competitive";
  max_players: number;
  requires_approval: boolean;
  visibility: "public" | "friends" | "community";
  community_id: string | null;
  community_name: string | null;
  game_night: boolean;
  starts_at: string | null;
  expires_at: string;
  created_at: string;
  state: "open" | "scheduled" | "full" | "expired" | "cancelled";
  accepted_count: number;
  pending_count: number;
  my_status: SquadMember["status"] | null;
  is_host: boolean;
  host_id: string | null;
  host_name: string;
  host_avatar: boolean;
  voice_allowed: boolean;
  voice_opens_at: string;
  can_join: boolean;
  compatible_platforms: Item[];
  members: SquadMember[];
};
export type Page = { items: Squad[]; next: string | null };
export type Result<T> =
  { data: T; error?: never } | { error: string; data?: never };
export type Block = { blocked_id: string; label: string; created_at: string };
