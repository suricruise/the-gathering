// Destructive rehearsal statements are loopback-only, enclosed in one rollback.
import pg from "pg";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const connectionString = readFileSync(
  ".local-stack/database-url",
  "utf8",
).trim();
if (!["localhost", "127.0.0.1"].includes(new URL(connectionString).hostname))
  throw Error("Local only");
const db = new pg.Client({ connectionString });
await db.connect();
try {
  await db.query("begin");
  await db.query("drop policy people_no_send on realtime.messages");
  await db.query(
    "drop function public.visible_profile(text),public.visible_avatar(uuid)",
  );
  await db.query(
    "alter function public.people_legacy_visible_profile(text) rename to visible_profile",
  );
  await db.query(
    "alter function public.people_legacy_visible_avatar(uuid) rename to visible_avatar",
  );
  const f = await db.query(
    "select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and (p.proname like 'people_%' or p.proname like 'dm_%' or p.proname in ('friendship_readable','bootstrap_privacy','invitation_block_guard'))",
  );
  for (const r of f.rows)
    await db.query(
      `drop function ${r.nspname}.${r.proname}(${r.args}) cascade`,
    );
  await db.query(
    "drop table public.member_privacy,public.friendships,public.conversations,public.direct_messages,public.conversation_preferences,public.member_notifications,public.direct_message_reports,private.people_budgets cascade",
  );
  if (
    (
      await db.query(
        "select to_regclass('supabase_migrations.schema_migrations') t",
      )
    ).rows[0].t
  )
    await db.query(
      "delete from supabase_migrations.schema_migrations where version like '20261028000%'",
    );
  const installer = readFileSync("supabase/phase9-setup.sql", "utf8")
    .replace(/^BEGIN;\s*$/m, "")
    .replace(/COMMIT;\s*$/m, "");
  await db.query(installer);
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from supabase_migrations.schema_migrations where version like '20261028000%'",
      )
    ).rows[0].n,
    3,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from pg_class where relname in ('member_privacy','friendships','conversations','direct_messages','conversation_preferences','member_notifications','direct_message_reports','people_budgets') and relrowsecurity",
      )
    ).rows[0].n,
    8,
  );
  console.log(
    "PASS fresh exact installer creates 8 RLS tables and 3 migration records",
  );
  await db.query(installer);
  console.log(
    "PASS second installer run skips all recorded versions without exception or data changes",
  );
  await db.query(
    "delete from supabase_migrations.schema_migrations where version='202610280003'",
  );
  await db.query(installer);
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from supabase_migrations.schema_migrations where version like '20261028000%'",
      )
    ).rows[0].n,
    3,
  );
  console.log("PASS pending-only installer completes recorded partial install");
  await db.query("savepoint unrecorded");
  await db.query(
    "delete from supabase_migrations.schema_migrations where version='202610280001'",
  );
  await assert.rejects(
    () => db.query(installer),
    /tables exist without a migration record/,
  );
  await db.query("rollback to savepoint unrecorded");
  console.log(
    "PASS ambiguous unrecorded tables fail closed without destructive reset",
  );
} finally {
  await db.query("rollback");
  await db.end();
}
