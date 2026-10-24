import pg from "pg";import assert from "node:assert/strict";import {readFileSync} from "node:fs";
const url=readFileSync(".local-stack/database-url","utf8").trim();if(!["localhost","127.0.0.1"].includes(new URL(url).hostname))throw Error("Local only");
const db=new pg.Client({connectionString:url});await db.connect();
const raw=readFileSync("supabase/community-management-setup.sql","utf8");assert.ok(raw.includes(readFileSync("supabase/migrations/202611020001_community_management.sql","utf8")));
const sql=raw.replace(/^BEGIN;\s*$/m,"").replace(/COMMIT;\s*$/m,"");
try{
 await db.query("begin;create schema if not exists supabase_migrations;create table if not exists supabase_migrations.schema_migrations(version text primary key,statements text[],name text)");
 await db.query("drop function public.community_directory(),public.community_manage(text,uuid,text,integer,text);alter table public.communities drop column display_order;delete from supabase_migrations.schema_migrations where version='202611020001'");
 await db.query(sql);assert.equal((await db.query("select count(*)::int n from supabase_migrations.schema_migrations where version='202611020001'")).rows[0].n,1);console.log("PASS fresh exact management installer");
 await db.query(sql);console.log("PASS recorded rerun skips safely");
 await db.query("delete from supabase_migrations.schema_migrations where version='202611020001';savepoint ambiguous");await assert.rejects(()=>db.query(sql),/objects exist without a migration record/);await db.query("rollback to savepoint ambiguous");console.log("PASS ambiguous objects refuse destructive repair");
}finally{await db.query("rollback");await db.end();}
