import {recordRun} from "./record-operational-run.mjs";
// Run daily with server-only credentials. No evidence or identifiers enter logs.
import { createClient } from "@supabase/supabase-js";
import { existsSync } from "node:fs";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key)
  throw Error("Configure Supabase server credentials securely.");
if (
  !["localhost", "127.0.0.1"].includes(new URL(url).hostname) &&
  !process.argv.includes("--hosted")
)
  throw Error("Use --hosted explicitly for hosted cleanup.");
const c = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const r = await c.rpc("moderation_cleanup");
if (r.error)
  throw Error(
    "Moderation cleanup failed; check private service configuration.",
  );
await recordRun(c,"moderation_cleanup");
console.log("Expired evidence records erased:", r.data);
