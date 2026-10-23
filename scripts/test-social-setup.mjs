// Local-only installer rehearsal. Every schema/storage change is rolled back.
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
    "select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and (p.proname like 'social_%' or p.proname in ('post_access','register_post_media','store_post_preview'))",
  );
  for (const f of functions.rows)
    await db.query(
      `drop function if exists ${f.nspname}.${f.proname}(${f.args}) cascade`,
    );
  await db.query(
    "drop table public.posts,public.post_media,public.post_reactions,public.post_comments,public.follows,public.post_reports,public.post_link_previews,private.social_moderators,private.social_budgets,private.social_audit cascade",
  );
  const policies = await db.query(
    "select policyname from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'social_%'",
  );
  for (const p of policies.rows)
    await db.query(`drop policy ${p.policyname} on storage.objects`);
  // Storage rows exist only in this loopback test stack; rollback restores them.
  await db.query("drop policy social_bucket_server_only on storage.buckets");
  await db.query(
    "set local storage.allow_delete_query='true';delete from storage.objects where bucket_id='social-media';delete from storage.buckets where id='social-media'",
  );
  if (
    (
      await db.query(
        "select to_regclass('supabase_migrations.schema_migrations') t",
      )
    ).rows[0].t
  )
    await db.query(
      "delete from supabase_migrations.schema_migrations where version like '20261026000%'",
    );
  const sql = readFileSync("supabase/phase7-setup.sql", "utf8")
    .replace(/^BEGIN;\s*$/m, "")
    .replace(/COMMIT;\s*$/, "");
  await db.query(sql);
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from supabase_migrations.schema_migrations where version like '20261026000%'",
      )
    ).rows[0].n,
    4,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relrowsecurity and ((n.nspname='public' and c.relname in ('posts','post_media','post_reactions','post_comments','follows','post_reports','post_link_previews')) or (n.nspname='private' and c.relname in ('social_moderators','social_budgets','social_audit')))",
      )
    ).rows[0].n,
    10,
  );
  assert.equal(
    (
      await db.query(
        "select public from storage.buckets where id='social-media'",
      )
    ).rows[0].public,
    false,
  );
  console.log(
    "PASS fresh Phase 7 installer: four migration records, ten RLS tables, private bucket; rolled back.",
  );
} finally {
  await db.query("rollback");
  await db.end();
}
