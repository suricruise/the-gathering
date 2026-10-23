export type Person = {
  id: string;
  username: string;
  name: string;
  avatar: boolean;
  online: boolean | null;
  relationship: "none" | "incoming" | "outgoing" | "friends";
  shared: string[];
};
export type Privacy = {
  discoverable: boolean;
  allow_requests: boolean;
  dm_policy: "friends" | "members" | "nobody";
  share_presence: boolean;
};
export type Conversation = {
  id: string;
  member: Person;
  muted: boolean;
  unread: number;
};
export type PeopleHome = {
  all_notification_unread?: number;
  notification_unread: number;
  privacy: Privacy;
  friends: Person[];
  conversations: Conversation[];
  notifications: { id: string; kind: string; member: Person; read: boolean }[];
  blocks: { id: string; name: string }[];
};
export type DirectMessage = {
  id: string;
  seq: string;
  sender: string;
  body: string;
  created_at: string;
};
export type History = {
  id: string;
  member: Person;
  can_send: boolean;
  items: DirectMessage[];
};
export type Result<T> = { data?: T; error?: string; denied?: boolean };
