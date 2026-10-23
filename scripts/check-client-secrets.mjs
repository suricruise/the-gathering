import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const secret = process.env.SUPABASE_SECRET_KEY;
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
      readFileSync(file, "utf8").includes(secret)
    )
      throw new Error(`Server credential leaked into client artifact: ${file}`);
  }
}
if (!existsSync(".next/static"))
  throw new Error("Build the application first.");
scan(".next/static");
console.log(
  "PASS: the configured server-only Supabase key is absent from all client build artifacts.",
);
