import "server-only";
import { requireUser } from "../auth/session";
export type Community = {
  id: string;
  slug: string;
  name: string;
  description: string;
  visibility: "public" | "discoverable" | "private";
  cover: string;
  community_headers?: { version: string } | null;
};
export type Channel = {
  id: string;
  community_id: string;
  category_id: string | null;
  name: string;
  description: string;
  kind: "text" | "voice";
  is_private: boolean;
  position: number;
};
export type Category = { id: string; name: string; position: number };
export type RosterMember = {
  user_id: string;
  username: string | null;
  display_name: string;
  role_id: string;
  status: string;
};
export type Invitation = {
  id: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
};
export type Override = {
  id: string;
  channel_id: string;
  role_id: string | null;
  user_id: string | null;
  can_view: boolean;
  can_post: boolean;
  can_connect: boolean;
};
export type Audit = {
  id: string;
  action: string;
  created_at: string;
  detail: Record<string, unknown>;
};
export async function communityIndex() {
  const { client, user } = await requireUser("/communities");
  const [list, approval, memberships] = await Promise.all([
    client
      .from("communities")
      .select("id,slug,name,description,visibility,cover,community_headers(version)")
      .order("name")
      .limit(200)
      .returns<Community[]>(),
    client.rpc("can_create_community"),
    client
      .from("community_members")
      .select("community_id,role_id,status")
      .eq("user_id", user.id),
  ]);
  if (list.error || approval.error || memberships.error) return null;
  return {
    communities: list.data as Community[],
    approved: approval.data === true,
    memberships: memberships.data as {
      community_id: string;
      role_id: string;
      status: string;
    }[],
  };
}
export async function communityDetail(slug: string) {
  const { client, user } = await requireUser("/communities");
  const { data, error } = await client
    .from("communities")
    .select("id,slug,name,description,visibility,cover,community_headers(version)")
    .eq("slug", slug)
    .maybeSingle<Community>();
  if (error) throw new Error("Community services are unavailable.");
  if (!data) return null;
  const c = data as Community;
  const [role, channels, categories, roster] = await Promise.all([
    client.rpc("community_my_role", { p_community: c.id }),
    client
      .from("channels")
      .select("*")
      .eq("community_id", c.id)
      .order("position")
      .order("name"),
    client
      .from("channel_categories")
      .select("id,name,position")
      .eq("community_id", c.id)
      .order("position")
      .order("name"),
    client.rpc("community_roster", { p_community: c.id }),
  ]);
  if (role.error || channels.error || categories.error || roster.error)
    throw new Error("Community details could not be loaded.");
  const staff = ["owner", "administrator", "moderator"].includes(role.data);
  const admin = ["owner", "administrator"].includes(role.data);
  const [invites, overrides, audit] = await Promise.all([
    staff
      ? client
          .from("invitations")
          .select("id,expires_at,accepted_at,revoked_at")
          .eq("community_id", c.id)
          .order("created_at", { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [], error: null }),
    admin
      ? client
          .from("channel_permission_overrides")
          .select("*")
          .eq("community_id", c.id)
      : Promise.resolve({ data: [], error: null }),
    staff
      ? client
          .from("community_audit_log")
          .select("id,action,created_at,detail")
          .eq("community_id", c.id)
          .order("created_at", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (invites.error || overrides.error || audit.error)
    throw new Error("Community management could not be loaded.");
  return {
    community: c,
    userId: user.id,
    role: role.data as string | null,
    channels: channels.data as Channel[],
    categories: categories.data as Category[],
    roster: roster.data as RosterMember[],
    invitations: invites.data as Invitation[],
    overrides: overrides.data as Override[],
    audit: audit.data as Audit[],
  };
}
export type CommunityDetailData = NonNullable<
  Awaited<ReturnType<typeof communityDetail>>
>;
