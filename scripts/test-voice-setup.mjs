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
  const functions = await db.query(
    "select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) args from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.proname like 'voice_%'",
  );
  for (const f of functions.rows)
    await db.query(
      `drop function ${f.nspname}.${f.proname}(${f.args}) cascade`,
    );
  await db.query(
    "drop table public.voice_rooms,private.voice_sessions,private.voice_suspensions,private.voice_budget,private.voice_worker,private.voice_http_budget cascade",
  );
  if (
    (
      await db.query(
        "select to_regclass('supabase_migrations.schema_migrations') as table_name",
      )
    ).rows[0].table_name
  )
    await db.query(
      "delete from supabase_migrations.schema_migrations where version like '20261025000%'",
    );
  const installer = readFileSync("supabase/phase6-setup.sql", "utf8")
    .replace(/^BEGIN;\s*$/m, "")
    .replace(/COMMIT;\s*$/, "");
  await db.query(installer);
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from supabase_migrations.schema_migrations where version like '20261025000%'",
      )
    ).rows[0].n,
    3,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relrowsecurity and ((n.nspname='public' and c.relname='voice_rooms') or (n.nspname='private' and c.relname in ('voice_sessions','voice_suspensions','voice_budget','voice_worker','voice_http_budget')))",
      )
    ).rows[0].n,
    6,
  );
  console.log(
    "PASS fresh single-file voice installer: three history records, six RLS tables, transaction rolled back.",
  );
} finally {
  await db.query("rollback");
  await db.end();
}
