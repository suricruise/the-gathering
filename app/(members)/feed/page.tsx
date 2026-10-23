import { z } from "zod";
import { socialContext } from "@/src/lib/social/data";
import { SocialFeed } from "@/src/components/social/SocialFeed";
import { PageHeading } from "@/src/components/ui";
export const dynamic = "force-dynamic";
export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ community?: string }>;
}) {
  const { client, user, options } = await socialContext();
  const query = await searchParams;
  const community = z.uuid().safeParse(query.community).success
    ? query.community!
    : null;
  const filters = {
    mode: community ? ("explore" as const) : ("for-you" as const),
    community,
    interest: null,
    author: null,
  };
  const r = await client.rpc("social_feed", {
    p_mode: filters.mode,
    p_community: community,
  });
  return (
    <div className="page social-page">
      <PageHeading
        eyebrow="YOUR PEOPLE · YOUR STORIES"
        title="The gathering, in motion."
        description="Clutch plays, creative worlds, and the moments in between."
      />
      <SocialFeed
        key={community ?? "all"}
        initial={r.data ?? { items: [], next: null }}
        unavailable={!!r.error}
        options={options}
        userId={user.id}
        initialFilters={filters}
      />
    </div>
  );
}
