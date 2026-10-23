import { requireUser } from "@/src/lib/auth/session";
import { MemberSafety } from "@/src/components/admin/MemberSafety";
export default async function Page() {
  await requireUser("/appeals");
  return <MemberSafety appeal />;
}
