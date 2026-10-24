-- Apply pending public/presence defaults once, then enable the all-member sidebar.
-- Recorded versions skip safely, preserving later member privacy choices.
BEGIN;
-- This explicitly makes existing profiles public and enables both presence settings once.
-- Review and back up before execution; later member choices are preserved on recorded reruns.
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
DO $preflight$ BEGIN
 IF to_regprocedure('public.community_people_rail(uuid,uuid)') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='202611060001') THEN RAISE EXCEPTION 'All-member rail exists without a migration record. Inspect history; do not reset tables.'; END IF;
END $preflight$;
DO $install$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='202611060001') THEN
 EXECUTE $migration$
-- Include offline and hidden-status members without weakening membership or presence privacy.
create function public.community_people_rail(p_channel uuid default null,p_after uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();cid uuid;items jsonb;begin
 if not private.squad_live(actor) then raise exception 'Unavailable' using errcode='42501';end if;
 if p_channel is not null then
  if not public.channel_access(p_channel) then raise exception 'Unavailable' using errcode='42501';end if;
  select community_id into cid from public.channels where id=p_channel;
 end if;
 if not public.people_budget('search') then return jsonb_build_object('limited',true);end if;
 select coalesce(jsonb_agg(x.card order by x.user_id),'[]') into items from (
  select p.user_id,private.people_card(actor,p.user_id)||jsonb_build_object('online',
   case when p.share_community_presence then coalesce(p.community_last_seen>now()-interval '90 seconds',false) else null end) card
  from public.member_privacy p
  where (p_after is null or p.user_id>p_after) and private.squad_live(p.user_id) and not private.squad_blocked(actor,p.user_id)
  and not private.people_friends(actor,p.user_id)
  and (case when cid is null then private.shared_member_community(actor,p.user_id) is not null else exists(select 1 from public.community_members where community_id=cid and user_id=p.user_id and status='active') end)
  order by p.user_id limit 26
 )x;
 return jsonb_build_object('items',items);
end$$;
revoke all on function public.community_people_rail(uuid,uuid) from public,anon,authenticated;
grant execute on function public.community_people_rail(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
$migration$;
 INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES('202611060001','all_member_rail');
 END IF;
END $install$;
COMMIT;
