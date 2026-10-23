import { redirect } from "next/navigation";
import { requireUser } from "@/src/lib/auth/session";
import { WorkspacePage } from "@/src/WorkspacePage";
export default async function MemberPage({
  params,
}: {
  params: Promise<{ path: string[] }>;
}) {
  const { path } = await params;
  const { client, user } = await requireUser(`/${path.join("/")}`);
  const { data, error } = await client
    .from("profiles")
    .select("onboarding_completed_at")
    .eq("id", user.id)
    .single();
  if (error) throw new Error("Your profile could not be loaded.");
  if (!data.onboarding_completed_at) redirect("/onboarding");
  return <WorkspacePage path={path} />;
}
