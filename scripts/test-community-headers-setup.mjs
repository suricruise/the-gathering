import pg from "pg";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const url=readFileSync(".local-stack/database-url","utf8").trim();
if (!["localhost","127.0.0.1"].includes(new URL(url).hostname)) throw Error("Local only");
const db=new pg.Client({connectionString:url});await db.connect();
const raw=readFileSync("supabase/community-headers-setup.sql","utf8");
assert.ok(raw.includes(readFileSync("supabase/migrations/202611010001_community_headers.sql","utf8")));
const sql=raw.replace(/^BEGIN;\s*$/m,"").replace(/COMMIT;\s*$/m,"");
const originalObjects=(await db.query("select count(*)::int n from storage.objects where bucket_id='community-headers'")).rows[0].n;
try {
 await db.query("begin;set local storage.allow_delete_query='true'");
 await db.query("create schema if not exists supabase_migrations;create table if not exists supabase_migrations.schema_migrations(version text primary key,statements text[],name text)");
 await db.query("drop function public.community_header_command(uuid,text,text,uuid,integer),public.community_header_orphans();drop table public.community_headers;delete from storage.objects where bucket_id='community-headers';delete from storage.buckets where id='community-headers';delete from supabase_migrations.schema_migrations where version='202611010001'");
 await db.query(sql);
 assert.equal((await db.query("select count(*)::int n from supabase_migrations.schema_migrations where version='202611010001'")).rows[0].n,1);
 console.log("PASS fresh header installer");
 await db.query(sql);console.log("PASS recorded rerun skips safely");
 await db.query("delete from supabase_migrations.schema_migrations where version='202611010001';savepoint ambiguous");
 await assert.rejects(()=>db.query(sql),/objects exist without a migration record/);
 await db.query("rollback to savepoint ambiguous");console.log("PASS ambiguous objects refuse destructive repair");
} finally {await db.query("rollback");assert.equal((await db.query("select count(*)::int n from storage.objects where bucket_id='community-headers'")).rows[0].n,originalObjects);await db.end();}
