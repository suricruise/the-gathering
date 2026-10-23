import { spacePage } from "@/src/lib/spaces/page";
export const dynamic = "force-dynamic";
export default async function Page() {
  return spacePage("events");
}
