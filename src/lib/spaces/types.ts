export type Preferences = {
  friend_requests: boolean;
  replies: boolean;
  mentions: boolean;
  community_invitations: boolean;
  event_reminders: boolean;
  event_updates: boolean;
  gaming_invitations: boolean;
  moderator_notices: boolean;
  daily_content: boolean;
};
export type Context = {
  communities: { id: string; name: string; rank: number }[];
  channels: { id: string; name: string; community_id: string }[];
  sessions: { id: string; name: string; community_id: string | null }[];
  preferences: Preferences;
};
export type Prayer = {
  id: string;
  seq: string;
  community_id: string;
  author_id: string;
  author_name: string;
  body: string;
  visibility: "community" | "moderators";
  status: "open" | "answered" | "hidden" | "removed";
  can_manage: boolean;
  moderator: boolean;
  encouraged: boolean;
  encouragements: number;
  created_at: string;
};
export type PrayerComment = {
  id: string;
  seq: string;
  author_name: string;
  body: string;
  can_remove: boolean;
  created_at: string;
};
export type Event = {
  id: string;
  seq: string;
  community_id: string;
  community_name: string;
  host_id: string;
  host_name: string;
  title: string;
  description: string;
  kind: "gaming" | "voice" | "discussion";
  banner: "nebula" | "aurora" | "ember" | "ocean";
  starts_at: string;
  ends_at: string;
  time_zone: string;
  revision: number;
  state: "upcoming" | "live" | "ended" | "cancelled";
  can_manage: boolean;
  gaming_session_id: string | null;
  voice_channel_id: string | null;
  going: number;
  my_rsvp: "going" | "interested" | "declined" | null;
};
export type Notice = {
  id: string;
  kind: keyof Preferences;
  resource_type: string;
  resource_id: string;
  href: string;
  read: boolean;
  created_at: string;
};
export type SpaceData = {
  items?: Prayer[] | Event[] | Notice[];
  prayer?: Prayer;
  comments?: PrayerComment[];
  unread?: number;
  preferences?: Preferences;
};
export type Result<T> = { data?: T; error?: string; denied?: boolean };
