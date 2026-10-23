import "server-only";
import { requireUser } from "../auth/session";
import type { SocialOptions } from "./types";
export async function socialContext() {
  const { client, user } = await requireUser("/feed");
  const [memberships, games] = await Promise.all([
    client
      .from("community_members")
      .select("community_id")
      .eq("user_id", user.id)
      .eq("status", "active"),
    client.from("games").select("id,name").order("name"),
  ]);
  const ids = memberships.data?.map((m) => m.community_id) ?? [];
  const communities = ids.length
    ? await client
        .from("communities")
        .select("id,name")
        .in("id", ids)
        .order("name")
    : { data: [] };
  return {
    client,
    user,
    options: {
      communities: communities.data ?? [],
      games: games.data ?? [],
    } as SocialOptions,
  };
}
