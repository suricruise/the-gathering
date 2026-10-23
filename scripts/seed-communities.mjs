import pg from "pg";
import { readFileSync } from "node:fs";
const connectionString = readFileSync(
  ".local-stack/database-url",
  "utf8",
).trim();
if (!["localhost", "127.0.0.1"].includes(new URL(connectionString).hostname))
  throw new Error("Development seed requires a loopback database.");
const db = new pg.Client({ connectionString });
await db.connect();
try {
  await db.query(readFileSync("supabase/seed-communities.sql", "utf8"));
  console.log(
    "Development communities/channels seeded; existing records preserved.",
  );
} finally {
  await db.end();
}
