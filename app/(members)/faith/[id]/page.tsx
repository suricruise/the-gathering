import { spacePage } from "@/src/lib/spaces/page";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return spacePage("prayer", (await params).id);
}
