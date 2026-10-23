import { communityIndex } from "@/src/lib/communities/data";
import { Directory } from "@/src/components/communities/Directory";
import { EmptyState, PageHeading } from "@/src/components/ui";
export default async function CommunitiesPage() {
  const data = await communityIndex();
  return data ? (
    <Directory {...data} />
  ) : (
    <div className="page">
      <PageHeading
        eyebrow="FIND YOUR PEOPLE"
        title="Your next gathering."
        description="Community services are temporarily unavailable."
      />
      <EmptyState
        title="Communities are unavailable"
        description="Community data could not be loaded. Please try again later; the site administrator may need to apply the community migration."
      />
    </div>
  );
}
