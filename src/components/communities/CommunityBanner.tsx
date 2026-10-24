import type { Community } from "../../lib/communities/data";

export function CommunityBanner({ community }: {
  community: Pick<Community, "id" | "name" | "cover" | "community_headers">;
}) {
  return (
    <div
      role="img"
      aria-label={`${community.name} community header`}
      className="community-cover community-cover-large"
      style={{ backgroundImage: community.community_headers
        ? `url(/api/communities/${community.id}/header?v=${community.community_headers.version})`
        : `url(/covers/${community.cover}.svg)` }}
    />
  );
}
