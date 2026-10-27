import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const secret = process.env.SUPABASE_SECRET_KEY;
const secrets = [secret, process.env.LIVEKIT_API_SECRET, process.env.YOUVERSION_APP_KEY].filter(Boolean);
if (!secret || secret.length < 20)
  throw new Error(
    "A configured server key is required for the client-bundle leak check.",
  );
function scan(path) {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const file = join(path, entry.name);
    if (entry.isDirectory()) scan(file);
    else if (
      /\.(js|map|json)$/.test(entry.name) &&
      secrets.some((value) => readFileSync(file, "utf8").includes(value))
    )
      throw new Error(`Server credential leaked into client artifact: ${file}`);
  }
}
if (!existsSync(".next/static"))
  throw new Error("Build the application first.");
scan(".next/static");
console.log(
  "PASS: configured server-only Supabase and LiveKit secrets are absent from all client build artifacts.",
);
