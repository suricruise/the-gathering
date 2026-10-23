import Link from "next/link";
import { notFound } from "next/navigation";
import { socialContext } from "@/src/lib/social/data";
import { communityDetail } from "@/src/lib/communities/data";
import { SocialFeed } from "@/src/components/social/SocialFeed";
import { PageHeading } from "@/src/components/ui";
export default async function CommunityPosts({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const community = await communityDetail(slug);
  if (!community?.role) notFound();
  const { client, user, options } = await socialContext();
  const r = await client.rpc("social_feed", {
    p_mode: "explore",
    p_community: community.community.id,
  });
  return (
    <div className="page social-page">
      <Link className="back-link" href={`/communities/${slug}`}>
        ← {community.community.name}
      </Link>
      <PageHeading
        eyebrow="COMMUNITY STORIES"
        title={`${community.community.name} posts`}
        description="Shared with active community members."
      />
      <SocialFeed
        initial={r.data ?? { items: [], next: null }}
        unavailable={!!r.error}
        options={options}
        userId={user.id}
        initialFilters={{
          mode: "explore",
          community: community.community.id,
          interest: null,
          author: null,
        }}
      />
    </div>
  );
}
