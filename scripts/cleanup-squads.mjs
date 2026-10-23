import {recordRun} from "./record-operational-run.mjs";
// Private scheduled maintenance only. Request-time expiry does not depend on cron.
import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key)
  throw Error("Configure the Supabase URL and server secret securely.");
if (
  !["localhost", "127.0.0.1"].includes(new URL(url).hostname) &&
  !process.argv.includes("--hosted")
)
  throw Error("Hosted cleanup requires explicit --hosted.");
const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const r = await admin.rpc("squad_cleanup", { p_limit: 500 });
if (r.error || !r.data)
  throw Error(
    "Squad cleanup failed. Check migrations and private service configuration.",
  );
await recordRun(admin,"squad_cleanup");
console.log(
  `Squad cleanup completed: ${Number(r.data.expired) || 0} expired, ${Number(r.data.deleted) || 0} removed by retention.`,
);
