import { requireUser } from "@/src/lib/auth/session";
import { AdminDashboard } from "@/src/components/admin/AdminDashboard";
export const dynamic = "force-dynamic";
export default async function Page() {
  const { client } = await requireUser("/admin");
  const r = await client.rpc("admin_read", { p_view: "context" });
  return <AdminDashboard initial={r.data || null} />;
}
