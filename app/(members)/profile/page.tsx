import {ProfileCover} from "@/src/components/profiles/ProfilePresentation";
import Link from "next/link";
import { requireUser } from "@/src/lib/auth/session";
import { loadMyProfile } from "@/src/lib/profiles/data";
import {
  AvatarEditor,
  ProfileEditor,
} from "@/src/components/auth/ProfileEditor";
import { PageHeading } from "@/src/components/ui";
export const metadata = { title: "Your profile" };
export default async function ProfilePage() {
  const { client, user } = await requireUser("/profile");
  const data = await loadMyProfile(client, user.id);
  return (
    <div className="page premium-profile-page">
      <PageHeading
        eyebrow="YOUR STORY, YOUR WAY"
        title="Your profile"
        description="Share your story, interests and how you like to connect."
      >
        {data.profile.username && (
          <Link
            href={`/members/${user.id}`}
            className="button secondary"
          >
            View my profile
          </Link>
        )}
      </PageHeading>
      <ProfileCover name={data.profile.display_name || "Member"}/>
      <Link href="/messages?tab=privacy" className="button secondary">Presence, discovery & messaging privacy</Link>
      <AvatarEditor
        version={data.profile.avatar_path}
        id={user.id}
        name={data.profile.display_name || "Member"}
        hasAvatar={!!data.profile.avatar_path}
      />
      <section className="panel padded">
        <ProfileEditor data={data} />
      </section>
    </div>
  );
}
