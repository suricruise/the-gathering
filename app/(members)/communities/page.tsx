import { communityIndex } from "@/src/lib/communities/data";
import { Directory } from "@/src/components/communities/Directory";
import { EmptyState, PageHeading } from "@/src/components/ui";
import {discoverySummary} from "@/src/lib/discovery/actions";
import {interestCategories} from "@/src/lib/discovery/model";
export default async function CommunitiesPage({searchParams}:{searchParams:Promise<{filter?:string;q?:string;interest?:string}>}) {
  const query=await searchParams;
  const initialFilter=query.filter==="joined"?"joined":"all";
  const initialQuery=typeof query.q==="string"?query.q.slice(0,100):"";
  const initialCategory=interestCategories.some(([id])=>id===query.interest)?query.interest!:"all";
  const [data,summary] = await Promise.all([communityIndex(),discoverySummary()]);
  const communities=(data?.communities??[]).map(c=>({...c,stats:summary.data?.items.find(s=>s.id===c.id)}));
  return data ? (
    <Directory key={`${initialFilter}:${initialQuery}:${initialCategory}`} {...data} communities={communities} initialFilter={initialFilter} initialQuery={initialQuery} initialCategory={initialCategory} activityUnavailable={!!summary.error} />
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
