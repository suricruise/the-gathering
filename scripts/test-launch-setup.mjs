import pg from "pg";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const connectionString = readFileSync(
  ".local-stack/database-url",
  "utf8",
).trim();
if (!["localhost", "127.0.0.1"].includes(new URL(connectionString).hostname))
  throw Error("Local only");
const d = new pg.Client({ connectionString });
await d.connect();
const raw = readFileSync("supabase/phase12-setup.sql", "utf8"),
  source = readFileSync(
    "supabase/migrations/202610310001_launch_operations.sql",
    "utf8",
  );
assert.ok(raw.includes(source));
const sql = raw.replace(/^BEGIN;\s*$/m, "").replace(/COMMIT;\s*$/m, "");
try {
  await d.query("begin");
  await d.query(
    "create schema if not exists supabase_migrations;create table if not exists supabase_migrations.schema_migrations(version text primary key,statements text[],name text)",
  );
  await d.query(
    "delete from supabase_migrations.schema_migrations where version='202610310001'",
  );
  await d.query(
    "drop trigger a_owner_deletion_guard on auth.users;drop function public.account_deletion_ready(),private.guard_owner_deletion(),public.operational_health(),public.record_operational_run(text);drop table private.operational_runs;alter table public.profiles drop column directory_seq",
  );
  const indexes = (
    await d.query(
      "select schemaname,indexname from pg_indexes where indexname like 'p12_fk_%' or indexname in ('messages_root_page','moderation_retention_due','moderation_scope_page','admin_scope_page')",
    )
  ).rows;
  for (const r of indexes)
    await d.query(`drop index ${r.schemaname}.${r.indexname}`);
  await d.query(sql);
  assert.equal(
    (
      await d.query(
        "select count(*)::int n from supabase_migrations.schema_migrations where version='202610310001'",
      )
    ).rows[0].n,
    1,
  );
  console.log("PASS fresh exact Phase 12 installer");
  await d.query(sql);
  console.log("PASS recorded installer rerun skips safely");
  await d.query("savepoint unrecorded");
  await d.query(
    "delete from supabase_migrations.schema_migrations where version='202610310001'",
  );
  await assert.rejects(
    () => d.query(sql),
    /objects exist without a migration record/,
  );
  await d.query("rollback to savepoint unrecorded");
  console.log("PASS ambiguous partial install refuses destructive repair");
} finally {
  await d.query("rollback");
  await d.end();
  console.log(
    "PASS rehearsal transaction rolled back, preserving prior data/schema",
  );
}
