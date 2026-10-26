import { redirect } from "next/navigation";
import { Home } from "@/src/screens/Home";
import { communityIndex } from "@/src/lib/communities/data";
import { requireUser } from "@/src/lib/auth/session";
import {discoverySummary} from "@/src/lib/discovery/actions";
export default async function HomePage() {
  const { client, user } = await requireUser();
  const { data, error } = await client
    .from("profiles")
    .select("onboarding_completed_at")
    .eq("id", user.id)
    .single();
  if (error) throw new Error("Your profile could not be loaded.");
  if (!data.onboarding_completed_at) redirect("/onboarding");
  const [communities,summary] = await Promise.all([communityIndex(),discoverySummary()]);
  const featured=(communities?.communities??[]).map(c=>({...c,stats:summary.data?.items.find(s=>s.id===c.id)}));
  return <Home featured={featured} memberships={communities?.memberships??[]} summary={summary.data} unavailable={!!summary.error} directoryUnavailable={!communities}/>;
}
