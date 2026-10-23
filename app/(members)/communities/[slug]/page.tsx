import { notFound } from "next/navigation";
import { communityDetail } from "@/src/lib/communities/data";
import { CommunityView } from "@/src/components/communities/CommunityView";
export default async function CommunityPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!/^[a-z][a-z0-9-]{2,47}$/.test(slug)) notFound();
  const data = await communityDetail(slug);
  if (!data) notFound();
  return <CommunityView data={data} />;
}
