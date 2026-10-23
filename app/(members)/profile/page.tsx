import Link from "next/link";
import { requireUser } from "@/src/lib/auth/session";
import { loadMyProfile } from "@/src/lib/profiles/data";
import {
  AvatarEditor,
  ProfileEditor,
} from "@/src/components/auth/ProfileEditor";
import { PageHeading } from "@/src/components/ui";
export const metadata = { title: "Your gamer profile" };
export default async function ProfilePage() {
  const { client, user } = await requireUser("/profile");
  const data = await loadMyProfile(client, user.id);
  return (
    <div className="page">
      <PageHeading
        eyebrow="YOUR STORY, YOUR WAY"
        title="Your gamer profile"
        description="A little about the person behind the player. These are your real account details."
      >
        {data.profile.username && (
          <Link
            href={`/people/${data.profile.username}`}
            className="button secondary"
          >
            View my profile
          </Link>
        )}
      </PageHeading>
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
