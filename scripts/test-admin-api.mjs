import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  connectionString = readFileSync(".local-stack/database-url", "utf8").trim();
for (const u of [url, connectionString])
  if (!["localhost", "127.0.0.1"].includes(new URL(u).hostname))
    throw Error("Local only");
const service = createClient(url, process.env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  }),
  client = () =>
    createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
const db = new pg.Client({ connectionString });
await db.connect();
let id;
try {
  const suffix = randomUUID().slice(0, 8),
    email = "admin-api-" + suffix + "@example.test",
    password = "Gathering-" + randomUUID();
  const r = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { date_of_birth: "1990-01-01" },
  });
  assert.equal(r.error, null);
  id = r.data.user.id;
  const c = client();
  assert.equal(
    (await c.auth.signInWithPassword({ email, password })).error,
    null,
  );
  assert.equal(
    (
      await c.rpc("save_my_profile", {
        p_username: "admapi_" + suffix,
        p_display_name: "Admin API fixture",
        p_bio: "Local testing only",
        p_visibility: "private",
        p_interests: [],
        p_games: [],
        p_platforms: [],
        p_complete: true,
      })
    ).error,
    null,
  );
  assert.equal(
    (await c.rpc("admin_read", { p_view: "members" })).error.code,
    "42501",
  );
  assert.equal(
    (await client().rpc("admin_read", { p_view: "context" })).error.code,
    "42501",
  );
  console.log(
    "PASS real API rejects ordinary and anonymous administrative access",
  );
  assert.equal(
    (
      await c.rpc("admin_command", {
        p_operation: "platform_role",
        p_data: {
          user_id: id,
          role: "owner",
          reason: "Attempted API escalation",
        },
      })
    ).error.code,
    "42501",
  );
  assert.ok(
    (await c.schema("private").from("moderation_cases").select("*")).error,
  );
  console.log(
    "PASS real API rejects role escalation and private evidence schema access",
  );
  await db.query(
    "insert into private.platform_roles(user_id,role) values($1,'administrator')",
    [id],
  );
  assert.equal(
    (await c.rpc("admin_read", { p_view: "context" })).data.rank,
    30,
  );
  await db.query("begin");
  await db.query("select pg_advisory_xact_lock(20261030)");
  await db.query("delete from private.platform_roles where user_id=$1", [id]);
  let finished = false;
  const pending = c
    .rpc("admin_command", {
      p_operation: "retention",
      p_data: { days: 90, reason: "Concurrent revoked staff action" },
    })
    .then((r) => {
      finished = true;
      return r;
    });
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(finished, false, "Action waits for authorization lock");
  await db.query("commit");
  assert.equal((await pending).error.code, "42501");
  assert.equal((await c.rpc("admin_read", { p_view: "context" })).data.rank, 0);
  console.log(
    "PASS concurrent role revocation serializes before mutation and rejects stale JWT privileges",
  );
  assert.ok((await c.rpc("moderation_cleanup")).error);
  console.log("PASS cleanup cannot be invoked with a member token");
} finally {
  await db.query("rollback");
  if (id) await service.auth.admin.deleteUser(id);
  await db.end();
}
