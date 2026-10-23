import { createClient } from "@supabase/supabase-js";
import { RoomServiceClient } from "livekit-server-sdk";
import { enforceVoice } from "./voice-enforcement.mjs";
// Environment must be injected explicitly; never silently load hosted credentials.
const {
  NEXT_PUBLIC_SUPABASE_URL: dbUrl,
  SUPABASE_SECRET_KEY: dbKey,
  LIVEKIT_URL: url,
  LIVEKIT_API_KEY: key,
  LIVEKIT_API_SECRET: secret,
} = process.env;
if (!dbUrl || !dbKey || !url || !key || !secret)
  throw Error("Voice worker environment is incomplete");
if (
  !["127.0.0.1", "localhost"].includes(new URL(dbUrl).hostname) &&
  !process.argv.includes("--hosted")
)
  throw Error(
    "Hosted worker requires --hosted and securely injected credentials",
  );
const admin = createClient(dbUrl, dbKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const service = new RoomServiceClient(url.replace(/^ws/, "http"), key, secret, {
  requestTimeout: 5,
});
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    stopping = true;
  });
console.log(
  "Voice enforcement worker started. Interval: 2 seconds. No media is recorded.",
);
while (!stopping) {
  try {
    await enforceVoice(admin, service);
  } catch {
    console.error(
      "Voice enforcement failed. New admissions expire closed after 15 seconds; check private service logs and connectivity.",
    );
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));
}
