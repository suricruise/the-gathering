import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
export type MemberProfile = {
  id: string;
  username: string | null;
  display_name: string;
  bio: string;
  visibility: "private" | "members" | "public";
  avatar_path: string | null;
  onboarding_completed_at: string | null;
};
export type CatalogItem = { id: string; name: string };
export async function loadMyProfile(client: SupabaseClient, id: string) {
  const [profile, preferences, games, platforms, gameCatalog, platformCatalog] =
    await Promise.all([
      client
        .from("profiles")
        .select(
          "id,username,display_name,bio,visibility,avatar_path,onboarding_completed_at",
        )
        .eq("id", id)
        .single(),
      client
        .from("user_preferences")
        .select("interests,event_reminders,show_gaming_activity,share_profile_interests")
        .eq("user_id", id)
        .single(),
      client.from("user_games").select("game_id").eq("user_id", id),
      client.from("user_platforms").select("platform_id").eq("user_id", id),
      client.from("games").select("id,name").order("name"),
      client.from("platforms").select("id,name").order("name"),
    ]);
  if (
    [profile, preferences, games, platforms, gameCatalog, platformCatalog].some(
      (result) => result.error,
    )
  )
    throw new Error(
      "Profile data is unavailable. Check Supabase migrations and connectivity.",
    );
  return {
    profile: profile.data as MemberProfile,
    preferences: preferences.data as {
      interests: string[];
      share_profile_interests: boolean;
      event_reminders: boolean;
      show_gaming_activity: boolean;
    },
    games: games.data!.map((g) => g.game_id as string),
    platforms: platforms.data!.map((p) => p.platform_id as string),
    gameCatalog: gameCatalog.data as CatalogItem[],
    platformCatalog: platformCatalog.data as CatalogItem[],
  };
}
export type ProfileBundle = Awaited<ReturnType<typeof loadMyProfile>>;
