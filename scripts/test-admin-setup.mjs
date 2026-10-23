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
const raw = readFileSync("supabase/phase11-setup.sql", "utf8"),
  sql = raw.replace(/^BEGIN;\s*$/m, "").replace(/COMMIT;\s*$/m, "");
for (const f of readdirSync("supabase/migrations").filter((f) =>
  f.startsWith("20261030000"),
))
  assert.ok(
    raw.includes(readFileSync("supabase/migrations/" + f, "utf8")),
    "Installer contains exact migration",
  );
async function restore(ns, old, name) {
  const r = await db.query(
    "select pg_get_functiondef(p.oid) def,pg_get_function_identity_arguments(p.oid) args from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname=$1 and p.proname=$2",
    [ns, old],
  );
  for (const f of r.rows) {
    await db.query(f.def.replace(`${ns}.${old}(`, `${ns}.${name}(`));
    await db.query(`drop function ${ns}.${old}(${f.args})`);
  }
}
try {
  await db.query("begin");
  await db.query(
    "create schema if not exists supabase_migrations;create table if not exists supabase_migrations.schema_migrations(version text primary key,statements text[],name text)",
  );
  for (const fn of [
    "capture_case_media",
    "central_content_audit",
    "central_community_audit",
    "archived_membership_guard",
    "case_hierarchy_guard",
    "space_feature_guard",
    "capture_legacy_report",
  ])
    await db.query(`drop function private.${fn}() cascade`);
  await db.query("drop function public.admin_command(text,jsonb)");
  await restore("public", "phase11_admin_command", "admin_command");
  for (const name of [
    "channel_access",
    "community_access",
    "community_command",
  ])
    await restore("public", "phase10_" + name, name);
  for (const name of [
    "community_rank",
    "space_rank",
    "voice_allowed",
    "channel_user_allowed",
    "event_allowed",
    "squad_eligible",
  ])
    await restore("private", "phase10_" + name, name);
  await db.query(
    "drop function public.admin_command(text,jsonb),public.admin_read(text,uuid,bigint,text),public.submit_report(text,uuid,text),public.submit_appeal(text,uuid),public.moderation_cleanup(),private.case_access(private.moderation_cases),private.platform_rank(),private.admin_community_rank(uuid),private.evidence_hold(text,text),public.admin_evidence_file(uuid) cascade",
  );
  await db.query(
    "drop table private.case_media,private.platform_roles,private.admin_settings,private.admin_audit,private.moderation_cases,public.moderation_appeals,public.site_announcements,public.community_settings cascade",
  );
  await db.query(
    "alter table public.communities drop column archived;alter table public.channels drop column disabled;alter table public.events drop column moderation_hidden",
  );
  await db.query(
    "delete from supabase_migrations.schema_migrations where version like '20261030000%'",
  );
  await db.query(sql);
  assert.equal(
    (
      await db.query(
        "select count(*)::integer n from supabase_migrations.schema_migrations where version like '20261030000%'",
      )
    ).rows[0].n,
    5,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::integer n from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relrowsecurity and ((n.nspname='private' and c.relname in ('platform_roles','admin_settings','admin_audit','moderation_cases','case_media')) or (n.nspname='public' and c.relname in ('moderation_appeals','site_announcements','community_settings')))",
      )
    ).rows[0].n,
    8,
  );
  console.log(
    "PASS fresh exact installer: five version records and eight RLS tables",
  );
  await db.query(sql);
  console.log("PASS safe rerun skips recorded versions");
  await db.query(
    "drop function private.capture_case_media(),private.evidence_hold(text,text),public.admin_evidence_file(uuid) cascade;drop table private.case_media",
  );
  await db.query(
    "delete from supabase_migrations.schema_migrations where version='202610300005'",
  );
  await db.query(sql);
  console.log("PASS pending-only version completion");
  await db.query("savepoint ambiguous");
  await db.query(
    "delete from supabase_migrations.schema_migrations where version='202610300001'",
  );
  await assert.rejects(
    () => db.query(sql),
    /tables exist without a migration record/,
  );
  await db.query("rollback to savepoint ambiguous");
  console.log("PASS ambiguous unrecorded tables fail closed");
} finally {
  await db.query("rollback");
  await db.end();
}
