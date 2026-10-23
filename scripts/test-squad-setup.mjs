// Fresh Phase 8 rehearsal is restricted to loopback and always rolled back.
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
  for (const [name, args] of [
    ["voice_admit", "uuid"],
    ["voice_session", "uuid,boolean"],
    ["voice_enforcement_snapshot", ""],
  ]) {
    await db.query(`drop function public.${name}(${args})`);
    await db.query(
      `alter function private.community_${name}(${args}) set schema public`,
    );
    await db.query(
      `alter function public.community_${name}(${args}) rename to ${name}`,
    );
    await db.query(
      `grant execute on function public.${name}(${args}) to ${name === "voice_enforcement_snapshot" ? "service_role" : "authenticated"}`,
    );
  }
  const funcs = await db.query(
    "select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.proname like 'squad_%'",
  );
  for (const f of funcs.rows)
    await db.query(
      `drop function if exists ${f.nspname}.${f.proname}(${f.args}) cascade`,
    );
  await db.query(
    "drop table public.gaming_sessions,public.gaming_session_members,public.game_platforms,public.member_blocks,private.squad_config,private.squad_budgets,private.squad_audit,private.squad_voice_sessions cascade",
  );
  if (
    (
      await db.query(
        "select to_regclass('supabase_migrations.schema_migrations') t",
      )
    ).rows[0].t
  )
    await db.query(
      "delete from supabase_migrations.schema_migrations where version like '20261027000%'",
    );
  const sql = readFileSync("supabase/phase8-setup.sql", "utf8")
    .replace(/^BEGIN;\s*$/m, "")
    .replace(/COMMIT;\s*$/, "");
  await db.query(sql);
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from supabase_migrations.schema_migrations where version like '20261027000%'",
      )
    ).rows[0].n,
    4,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from pg_class t join pg_namespace n on n.oid=t.relnamespace where t.relrowsecurity and ((n.nspname='public' and t.relname in ('game_platforms','gaming_sessions','gaming_session_members','member_blocks')) or (n.nspname='private' and t.relname in ('squad_config','squad_audit','squad_voice_sessions','squad_budgets')))",
      )
    ).rows[0].n,
    8,
  );
  assert.equal(
    (
      await db.query(
        "select has_function_privilege('authenticated','private.community_voice_admit(uuid)','execute') allowed",
      )
    ).rows[0].allowed,
    false,
  );
  assert.equal(
    (
      await db.query(
        "select has_function_privilege('authenticated','public.squad_cleanup(integer)','execute') allowed",
      )
    ).rows[0].allowed,
    false,
  );
  await db.query("savepoint rerun");
  await assert.rejects(
    db.query(sql),
    (e) =>
      e.code === "P0001" &&
      e.message.startsWith("Squad Up tables already exist"),
  );
  await db.query("rollback to savepoint rerun");
  console.log(
    "PASS fresh Squad Up installer: four migration records, eight RLS tables, private legacy voice helpers, safe rerun guard; rolled back.",
  );
} finally {
  await db.query("rollback");
  await db.end();
}
