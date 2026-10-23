import "server-only";
import { createAdminClient } from "../supabase/admin";
export async function removeAccountChatFiles(userId: string) {
  const admin = createAdminClient();
  for (let batch = 0; batch < 20; batch++) {
    const { data, error } = await admin.rpc("chat_cleanup_files", {
      p_user: userId,
      p_limit: 500,
    });
    if (error || !Array.isArray(data)) return false;
    if (!data.length) return true;
    const removed = await admin.storage
      .from("message-files")
      .remove(data.map((file: { storage_path: string }) => file.storage_path));
    if (removed.error) return false;
    const marked = await admin.rpc("chat_files_removed", {
      p_ids: data.map((file: { id: string }) => file.id),
    });
    if (marked.error || marked.data !== true) return false;
  }
  return false;
}
