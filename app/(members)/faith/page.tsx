import { spacePage } from "@/src/lib/spaces/page";
export const dynamic = "force-dynamic";
export default async function Page({searchParams}:{searchParams:Promise<{community?:string}>}) {
  const query=await searchParams;
  return spacePage("faith",undefined,query.community);
}
