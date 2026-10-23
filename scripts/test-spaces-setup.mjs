import pg from "pg";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
const connectionString = readFileSync(
  ".local-stack/database-url",
  "utf8",
).trim();
if (!["localhost", "127.0.0.1"].includes(new URL(connectionString).hostname))
  throw Error("Local only");
const db = new pg.Client({ connectionString });
await db.connect();
const files = readdirSync("supabase/migrations")
    .filter((f) => f.startsWith("20261029000"))
    .sort(),
  sources = files.map((f) => readFileSync("supabase/migrations/" + f, "utf8"));
const raw = readFileSync("supabase/phase10-setup.sql", "utf8");
for (const s of sources)
  assert.ok(
    raw.includes(s),
    "Installer must contain exact versioned migration",
  );
try {
  await db.query("begin");
  await db.query("drop function public.people_home()");
  await db.query(
    "alter function public.legacy_people_home() rename to people_home",
  );
  await db.query(
    "grant execute on function public.people_home() to authenticated",
  );
  const names = [
    ...new Set(
      sources
        .flatMap((s) =>
          [...s.matchAll(/create (?:or replace )?function (\w+\.\w+)\(/gi)].map(
            (m) => m[1],
          ),
        )
        .filter((n) => n !== "public.people_home"),
    ),
  ];
  for (const name of names) {
    const [ns, fn] = name.split(".");
    const r = await db.query(
      "select pg_get_function_identity_arguments(p.oid) args from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname=$1 and p.proname=$2",
      [ns, fn],
    );
    for (const row of r.rows)
      await db.query(`drop function ${name}(${row.args}) cascade`);
  }
  const publicTables = [
    "prayer_requests",
    "prayer_comments",
    "prayer_encouragements",
    "events",
    "event_rsvps",
    "notification_preferences",
    "community_notification_invitations",
    "gaming_session_invitations",
    "moderator_notices",
    "notifications",
  ];
  const privateTables = [
    "community_delivery_tokens",
    "space_budgets",
    "space_audit",
    "notification_delivery_outbox",
  ];
  await db.query(
    "drop table " +
      [
        ...publicTables.map((t) => "public." + t),
        ...privateTables.map((t) => "private." + t),
      ].join(",") +
      " cascade",
  );
  if (
    (
      await db.query(
        "select to_regclass('supabase_migrations.schema_migrations') t",
      )
    ).rows[0].t
  )
    await db.query(
      "delete from supabase_migrations.schema_migrations where version like '20261029000%'",
    );
  const sql = raw.replace(/^BEGIN;\s*$/m, "").replace(/COMMIT;\s*$/m, "");
  await db.query(sql);
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from supabase_migrations.schema_migrations where version like '20261029000%'",
      )
    ).rows[0].n,
    4,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from pg_class where relname=any($1) and relrowsecurity",
        [[...publicTables, ...privateTables]],
      )
    ).rows[0].n,
    14,
  );
  console.log(
    "PASS exact installer creates four migration records and fourteen RLS tables",
  );
  await db.query(sql);
  console.log("PASS rerun skips all recorded versions without changing data");
  await db.query(
    "delete from supabase_migrations.schema_migrations where version='202610290004'",
  );
  // Version 4 includes trigger definitions; this models only genuinely pending DDL.
  await db.query(
    "drop trigger targeted_invitation_guard on public.invitations; drop trigger spaces_on_block on public.member_blocks; drop function private.targeted_invitation_guard(),private.spaces_on_block(),private.sync_event_reminder_preference() cascade",
  );
  await db.query(sql);
  console.log("PASS installer completes only the missing version");
  await db.query("savepoint ambiguous");
  await db.query(
    "delete from supabase_migrations.schema_migrations where version='202610290001'",
  );
  await assert.rejects(
    () => db.query(sql),
    /tables exist without a migration record/,
  );
  await db.query("rollback to savepoint ambiguous");
  console.log(
    "PASS unrecorded existing tables fail closed without destructive repair",
  );
} finally {
  await db.query("rollback");
  await db.end();
}
