import {recordRun} from "./record-operational-run.mjs";
// Run on a private scheduled worker, never in the browser.
import { existsSync } from "node:fs";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
import { createClient } from "@supabase/supabase-js";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!url || !process.env.SUPABASE_SECRET_KEY)
  throw Error("Configure the project URL and server secret securely.");
if (
  !["localhost", "127.0.0.1"].includes(new URL(url).hostname) &&
  !process.argv.includes("--hosted")
)
  throw Error("Hosted cleanup requires explicit --hosted.");
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
let count = 0;
for (let batch = 0; batch < 20; batch++) {
  const result = await admin.rpc("social_cleanup_files", {
    p_user: null,
    p_limit: 500,
  });
  if (result.error) throw Error("Cleanup query failed");
  if (!result.data.length) break;
  const removed = await admin.storage
    .from("social-media")
    .remove(result.data.map((f) => f.storage_path));
  if (removed.error) throw Error("Storage removal failed");
  const marked = await admin.rpc("social_files_removed", {
    p_ids: result.data.map((f) => f.id),
  });
  if (marked.error || marked.data !== true)
    throw Error("Cleanup metadata update failed");
  count += result.data.length;
}
await recordRun(admin,"social_cleanup");
console.log(`Removed ${count} expired staged/deleted-post files.`);
