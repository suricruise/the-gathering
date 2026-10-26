import {ProfileCover,ProfileConnections} from "@/src/components/profiles/ProfilePresentation";
import {profileDetails} from "@/src/lib/profiles/lounge";
import Link from "next/link";
import { createClient } from "@/src/lib/supabase/server";
import { publicConfig } from "@/src/lib/config";
import { Brand, EmptyState, ProfileAvatar } from "@/src/components/ui";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Member profile",
  robots: { index: false, follow: false },
};
export default async function VisibleProfile({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  let profile = null;
  if (publicConfig() && /^[a-z][a-z0-9_]{2,23}$/.test(username)) {
    const client = await createClient();
    const { data, error } = await client.rpc("visible_profile", {
      p_username: username,
    });
    if (!error) profile = data?.[0];
  }
  const details=profile?await profileDetails(username):{};
  return (
    <div className="public-profile-page premium-profile-page">
      <header className="auth-header">
        <Brand />
        <Link href="/home" className="button secondary">
          My gathering
        </Link>
      </header>
      <main className="public-profile-card panel padded">
        {profile ? (
          <>
            <ProfileCover name={profile.display_name}/>
            <span className="eyebrow">A LITTLE OF THEIR STORY</span>
            {profile.has_avatar ? (
              <img
                className="member-avatar-image"
                src={`/api/avatars/${profile.id}`}
                width={96}
                height={96}
                alt={`${profile.display_name} avatar`}
              />
            ) : (
              <ProfileAvatar name={profile.display_name} size="large" />
            )}
            <h1>{profile.display_name}</h1>
            <p className="muted">@{profile.username}</p>
            <p className="body-copy">
              {profile.bio || "A little more of their story is still to come."}
            </p>
            <Link className="button secondary" href={`/members/${profile.id}`}>Friend & message options</Link>
            <ProfileConnections details={details.data} error={details.error}/>
            <h2>Gaming favorites</h2>
            <div className="tag-row">
              {profile.favorite_games.map((game: string) => (
                <span className="pill" key={game}>
                  {game}
                </span>
              ))}
            </div>
            <h2>Gaming platforms</h2>
            <div className="tag-row">
              {profile.gaming_platforms.map((platform: string) => (
                <span className="pill" key={platform}>
                  {platform}
                </span>
              ))}
            </div>
          </>
        ) : (
          <EmptyState
            title="This profile isn’t available"
            description="It may be private, incomplete, or unavailable. Sign in if you have access."
          >
            <Link href="/login" className="button primary">
              Sign in
            </Link>
          </EmptyState>
        )}
      </main>
    </div>
  );
}
