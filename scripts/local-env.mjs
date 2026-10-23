// Explicit local-only setup helper. Never reads or writes hosted credentials.
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
if (existsSync(".env.local"))
  throw new Error(".env.local already exists; refusing to overwrite it.");
const status = JSON.parse(
  execFileSync("node_modules/.bin/supabase", ["status", "-o", "json"], {
    env: {
      ...process.env,
      SUPABASE_HOME: process.env.SUPABASE_HOME || "/workspace/.supabase-cli",
    },
    stdio: ["ignore", "pipe", "ignore"],
  }).toString(),
);
const url = status.API_URL || status.SUPABASE_URL;
if (!url || !["127.0.0.1", "localhost"].includes(new URL(url).hostname))
  throw new Error("Expected a local Supabase stack.");
const publishable = status.PUBLISHABLE_KEY || status.ANON_KEY;
const secret = status.SECRET_KEY || status.SERVICE_ROLE_KEY;
if (!publishable || !secret)
  throw new Error("Local stack credentials are unavailable.");
writeFileSync(
  ".env.local",
  `NEXT_PUBLIC_SUPABASE_URL=${url}\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${publishable}\nSUPABASE_SECRET_KEY=${secret}\nAPP_URL=http://127.0.0.1:3000\n`,
  { mode: 0o600, flag: "wx" },
);
console.log(
  "Created ignored .env.local for the local stack. No credentials printed.",
);
