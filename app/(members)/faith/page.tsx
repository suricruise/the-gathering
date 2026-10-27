import Link from 'next/link';
import { spacePage } from "@/src/lib/spaces/page";
export const dynamic = "force-dynamic";
export default async function Page({searchParams}:{searchParams:Promise<{community?:string}>}) {
  const query=await searchParams;
  return <><section className="faith-circles-entry panel padded" aria-label="Faith Circles"><div><strong>Faith Circles</strong><p>Grow in the Word. Grow Together.</p></div><Link className="button primary" href="/faith-circles">Explore Faith Circles</Link></section>{await spacePage("faith",undefined,query.community)}</>;
}
