import {recordRun} from "./record-operational-run.mjs";
// Private scheduler only. Never deploy a public unauthenticated cron endpoint.
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
  throw Error("Hosted reminder delivery requires explicit --hosted.");
const c = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const r = await c.rpc("deliver_event_reminders", { p_limit: 500 });
if (r.error)
  throw Error(
    "Reminder delivery failed. Check Phase 10 migrations and private service configuration.",
  );
await recordRun(c,"event_reminders");
console.log(
  `Reminder pass completed: ${Number(r.data?.scanned) || 0} eligible RSVPs checked; ${Number(r.data?.delivered) || 0} in-app reminders created. No email or push was sent.`,
);
