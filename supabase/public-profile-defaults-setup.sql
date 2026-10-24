-- This explicitly makes existing profiles public and enables both presence settings once.
-- Review and back up before execution; later member choices are preserved on recorded reruns.
BEGIN;
SELECT pg_advisory_xact_lock(20261030);
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations(version text PRIMARY KEY,statements text[],name text);
REVOKE ALL ON SCHEMA supabase_migrations FROM public,anon,authenticated;
REVOKE ALL ON supabase_migrations.schema_migrations FROM public,anon,authenticated;
DO $preflight$ BEGIN
 IF to_regprocedure('public.online_member_rail(uuid,uuid)') IS NULL THEN RAISE EXCEPTION 'Apply people-rail-setup.sql first.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='202611050001') AND
 EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='visibility' AND column_default = '''public''::text') AND
 (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='member_privacy' AND column_name IN ('share_presence','share_community_presence') AND column_default='true')=2
 THEN RAISE EXCEPTION 'Public defaults already exist without a migration record. Inspect history to avoid overwriting later privacy choices.'; END IF;
END $preflight$;
DO $install$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='202611050001') THEN
 EXECUTE $migration$
-- Owner-requested one-time reset of existing account defaults.
-- Versioned installers must record this migration so later member choices survive reruns.
alter table public.profiles alter column visibility set default 'public';
alter table public.member_privacy alter column share_presence set default true;
alter table public.member_privacy alter column share_community_presence set default true;
update public.profiles set visibility='public' where visibility<>'public';
update public.member_privacy set share_presence=true,share_community_presence=true,last_seen=null,community_last_seen=null;
-- Presence still requires real authenticated heartbeats; do not fabricate online members.
$migration$;
 INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES('202611050001','public_profile_defaults');
 END IF;
END $install$;
COMMIT;
