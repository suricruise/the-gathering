import { communityIndex } from "@/src/lib/communities/data";
import { Directory } from "@/src/components/communities/Directory";
import { EmptyState, PageHeading } from "@/src/components/ui";
export default async function CommunitiesPage({searchParams}:{searchParams:Promise<{filter?:string;q?:string}>}) {
  const query=await searchParams;
  const initialFilter=query.filter==="joined"?"joined":"all";
  const initialQuery=typeof query.q==="string"?query.q.slice(0,100):"";
  const data = await communityIndex();
  return data ? (
    <Directory key={`${initialFilter}:${initialQuery}`} {...data} initialFilter={initialFilter} initialQuery={initialQuery} />
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
