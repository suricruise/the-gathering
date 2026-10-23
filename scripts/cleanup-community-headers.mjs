// Private scheduled job: removes replaced, deleted-community and abandoned uploads.
import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!url || !process.env.SUPABASE_SECRET_KEY) throw Error("Configure server credentials securely.");
if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname) && !process.argv.includes("--hosted")) throw Error("Hosted cleanup requires explicit --hosted.");
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
let count = 0;
for (let batch = 0; batch < 20; batch++) {
  const result = await admin.rpc("community_header_orphans");
  if (result.error) throw Error("Header cleanup query failed.");
  if (!result.data?.length) break;
  const removed = await admin.storage.from("community-headers").remove(result.data.map((r) => r.object_path));
  if (removed.error) throw Error("Header storage cleanup failed.");
  count += result.data.length;
}
console.log(`Removed ${count} unused community header images.`);
