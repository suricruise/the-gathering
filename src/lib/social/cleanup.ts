import "server-only";
import { createAdminClient } from "../supabase/admin";
export async function removeAccountSocialFiles(userId: string) {
  const admin = createAdminClient();
  for (let i = 0; i < 20; i++) {
    const r = await admin.rpc("social_cleanup_files", {
      p_user: userId,
      p_limit: 500,
    });
    if (r.error || !Array.isArray(r.data)) return false;
    if (!r.data.length) return true;
    const files = r.data as { id: string; storage_path: string }[];
    const removed = await admin.storage
      .from("social-media")
      .remove(files.map((f) => f.storage_path));
    if (removed.error) return false;
    const mark = await admin.rpc("social_files_removed", {
      p_ids: files.map((f) => f.id),
    });
    if (mark.error || mark.data !== true) return false;
  }
  return false;
}
