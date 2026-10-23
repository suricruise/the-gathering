import "server-only";
import { redirect } from "next/navigation";
import { requireUser } from "../auth/session";
import type { SquadOptions } from "./types";
export async function squadContext() {
  const { client, user } = await requireUser("/squad-up");
  const profile = await client
    .from("profiles")
    .select("onboarding_completed_at")
    .eq("id", user.id)
    .single();
  if (profile.error) throw Error("Profile unavailable.");
  if (!profile.data.onboarding_completed_at) redirect("/onboarding");
  const [games, platforms, maps, memberships] = await Promise.all([
    client.from("games").select("id,name").order("name"),
    client.from("platforms").select("id,name").order("name"),
    client.from("game_platforms").select("game_id,platform_id,crossplay_pool"),
    client
      .from("community_members")
      .select("community_id,role_id")
      .eq("user_id", user.id)
      .eq("status", "active"),
  ]);
  const ids = memberships.data?.map((m) => m.community_id) ?? [];
  const communities = ids.length
    ? await client
        .from("communities")
        .select("id,name")
        .in("id", ids)
        .order("name")
    : { data: [] };
  const options: SquadOptions = {
    games: games.data ?? [],
    platforms: platforms.data ?? [],
    compatibility: maps.data ?? [],
    communities: (communities.data ?? []).map((c) => ({
      ...c,
      staff: ["owner", "administrator", "moderator"].includes(
        memberships.data?.find((m) => m.community_id === c.id)?.role_id ?? "",
      ),
    })),
  };
  return { client, user, options, unavailable: !!maps.error };
}
