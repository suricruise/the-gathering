import pg from 'pg';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
const url=readFileSync('.local-stack/database-url','utf8').trim();if(!['localhost','127.0.0.1'].includes(new URL(url).hostname))throw Error('Local only');
const d=new pg.Client({connectionString:url});await d.connect();const raw=readFileSync('supabase/people-rail-setup.sql','utf8');assert.ok(raw.includes(readFileSync('supabase/migrations/202611040001_people_rail.sql','utf8')));const sql=raw.replace(/^BEGIN;\s*$/m,'').replace(/COMMIT;\s*$/m,'');
try{
 await d.query('begin;create schema if not exists supabase_migrations;create table if not exists supabase_migrations.schema_migrations(version text primary key,statements text[],name text)');
 await d.query("drop function public.member_contact(uuid),public.online_member_rail(uuid,uuid),public.community_presence_preference(boolean),public.community_presence_pulse(),private.shared_member_community(uuid,uuid);alter table public.member_privacy drop column share_community_presence,drop column community_last_seen;delete from supabase_migrations.schema_migrations where version='202611040001'");
 await d.query(sql);assert.equal((await d.query("select count(*)::int n from supabase_migrations.schema_migrations where version='202611040001'")).rows[0].n,1);console.log('PASS fresh exact people rail installer');
 await d.query(sql);console.log('PASS recorded rerun safely skips');
 await d.query("delete from supabase_migrations.schema_migrations where version='202611040001';savepoint ambiguous");await assert.rejects(()=>d.query(sql),/objects exist without a migration record/);await d.query('rollback to savepoint ambiguous');console.log('PASS ambiguous state refuses destructive repair');
}finally{await d.query('rollback');await d.end();}
