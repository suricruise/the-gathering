-- Phase 12 pending-only installer. Review and approve before production execution.
BEGIN;
SELECT pg_advisory_xact_lock(20261030);
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations(version text PRIMARY KEY,statements text[],name text);
REVOKE ALL ON SCHEMA supabase_migrations FROM public,anon,authenticated;
REVOKE ALL ON supabase_migrations.schema_migrations FROM public,anon,authenticated;
DO $preflight$ BEGIN
 IF to_regprocedure('public.admin_evidence_file(uuid)') IS NULL THEN RAISE EXCEPTION 'Install Phase 11 first.'; END IF;
 IF (to_regclass('private.operational_runs') IS NOT NULL OR EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='directory_seq')) AND NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='202610310001') THEN RAISE EXCEPTION 'Phase 12 objects exist without a migration record. Inspect history; no destructive reset was performed.'; END IF;
END $preflight$;
DO $install$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='202610310001') THEN
 EXECUTE $migration$
-- Phase 12: fail-closed ownership deletion, bounded member directory and operational checks.
create function public.account_deletion_ready() returns boolean language sql stable security definer set search_path='' as $$
 select private.is_verified_member() and not exists(select 1 from private.platform_roles where user_id=auth.uid() and role='owner') and not exists(select 1 from public.community_members where user_id=auth.uid() and role_id='owner');
$$;
create function private.guard_owner_deletion() returns trigger language plpgsql security definer set search_path='' as $$begin
 perform pg_advisory_xact_lock(20261030);
 if exists(select 1 from private.platform_roles where user_id=old.id and role='owner') or exists(select 1 from public.community_members where user_id=old.id and role_id='owner') then raise exception 'Transfer ownership before account deletion' using errcode='42501';end if;return old;end$$;
-- Alphabetically precedes existing cleanup triggers; direct Auth Admin deletion cannot bypass it.
create trigger a_owner_deletion_guard before delete on auth.users for each row execute function private.guard_owner_deletion();
alter table public.profiles add column directory_seq bigint generated always as identity unique;
-- Match FK prefixes correctly (pg_index arrays are zero-based). Avoid redundant indexes
-- and immutable small game/platform/role catalogs. These support deletion and live scopes.
do $$declare r record;cols text;begin
 for r in select con.conname,con.conrelid,con.conkey,n.nspname,c.relname from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
 where con.contype='f' and n.nspname in ('public','private') and con.confrelid in ('auth.users'::regclass,'public.communities'::regclass,'public.channels'::regclass,'public.messages'::regclass,'public.posts'::regclass,'public.events'::regclass,'public.gaming_sessions'::regclass)
 and not exists(select 1 from pg_index i where i.indrelid=c.oid and i.indisvalid and i.indpred is null and not exists(select 1 from unnest(con.conkey) with ordinality k(att,ord) where i.indkey[(k.ord-1)::integer] is distinct from k.att)) loop
 select string_agg(quote_ident(a.attname),',' order by k.ord) into cols from unnest(r.conkey) with ordinality k(att,ord) join pg_attribute a on a.attrelid=r.conrelid and a.attnum=k.att;
 execute format('create index %I on %I.%I(%s)','p12_fk_'||substr(md5(r.nspname||'.'||r.relname||'.'||r.conname),1,20),r.nspname,r.relname,cols);
 end loop;end$$;
create index messages_root_page on public.messages(channel_id,created_seq desc) where parent_id is null;
create index moderation_retention_due on private.moderation_cases(retain_until);
create index moderation_scope_page on private.moderation_cases(community_id,seq desc);
create index admin_scope_page on private.admin_audit(community_id,id desc);
create table private.operational_runs(name text primary key check(name in ('chat_cleanup','social_cleanup','squad_cleanup','moderation_cleanup','event_reminders')),completed_at timestamptz not null default now());
alter table private.operational_runs enable row level security;
revoke all on private.operational_runs from public,anon,authenticated;
create function public.record_operational_run(p_name text) returns void language sql security definer set search_path='' as $$insert into private.operational_runs(name) values(p_name) on conflict(name) do update set completed_at=clock_timestamp()$$;
create function public.operational_health() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('migration',to_regprocedure('public.account_deletion_ready()') is not null,
 'rls',not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind='r' and not c.relrowsecurity),
 'storage',3=(select count(*) from storage.buckets where id in ('avatars','message-files','social-media') and not public),
 'voice_worker',exists(select 1 from private.voice_worker where checked_at>clock_timestamp()-interval '15 seconds'),
 'maintenance',not exists(select 1 from unnest(array['chat_cleanup','social_cleanup','squad_cleanup','moderation_cleanup']) job where not exists(select 1 from private.operational_runs r where r.name=job and r.completed_at>clock_timestamp()-interval '26 hours')));
$$;
revoke all on function public.account_deletion_ready(),private.guard_owner_deletion(),public.record_operational_run(text),public.operational_health() from public,anon,authenticated;
grant execute on function public.account_deletion_ready() to authenticated;
grant execute on function public.record_operational_run(text),public.operational_health() to service_role;
create or replace function public.admin_read(p_view text default 'overview',p_community uuid default null,p_before bigint default null,p_search text default '') returns jsonb language plpgsql security definer set search_path='' as $$
declare pr integer:=private.platform_rank();cr integer:=private.admin_community_rank(p_community);result jsonb;begin
 if not private.is_verified_member() or length(p_search)>48 or (p_before is not null and p_before<1) then raise exception 'Not authorized' using errcode='42501';end if;
 if p_view='context' then return jsonb_build_object('rank',pr,'communities',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'rank',private.admin_community_rank(c.id),'archived',c.archived) order by c.name) from public.communities c where pr>=20 or private.admin_community_rank(c.id)>=20),'[]'),'retention_days',case when pr>=30 then (select evidence_days from private.admin_settings) else null end);end if;
 if pr<20 and cr<20 then raise exception 'Not authorized' using errcode='42501';end if;
 if not private.take_limit('admin-read:'||auth.uid()::text,300,900) then raise exception 'Rate limited' using errcode='42501';end if;
 if p_view='overview' then return jsonb_build_object('members',(select count(*) from public.profiles p where (p_community is null and pr>=20) or exists(select 1 from public.community_members m where m.user_id=p.id and m.community_id=p_community)),'communities',(select count(*) from public.communities where (p_community is null and pr>=20) or id=p_community),'messages_7d',(select count(*) from public.messages m join public.channels c on c.id=m.channel_id where m.created_at>now()-interval '7 days' and ((p_community is null and pr>=20) or c.community_id=p_community)),'open_reports',(select count(*) from private.moderation_cases c where c.status='open' and private.case_access(c) and (p_community is null or c.community_id=p_community)),'voice_admissions',(select count(*) from private.voice_sessions v join public.channels c on c.id=v.channel_id where v.expires_at>now() and ((p_community is null and pr>=20) or c.community_id=p_community)),'posts_7d',(select count(*) from public.posts where created_at>now()-interval '7 days' and ((p_community is null and pr>=20) or community_id=p_community)));end if;
 if p_view='members' then
 select coalesce(jsonb_agg(x order by x.seq desc),'[]') into result from (select p.id,p.directory_seq seq,p.username,p.display_name,case when pr>=20 then case when u.banned_until>now() then 'restricted' else 'active' end else m.status end status,case when pr>=20 then r.role else null end platform_role,m.role_id community_role from public.profiles p join auth.users u on u.id=p.id left join private.platform_roles r on r.user_id=p.id left join public.community_members m on m.user_id=p.id and m.community_id=p_community where ((p_community is null and pr>=20) or m.community_id=p_community) and (p_search='' or left(lower(p.username),length(p_search))=lower(p_search)) and (p_before is null or p.directory_seq<p_before) order by p.directory_seq desc limit 50)x;return result;
 elsif p_view='reports' then
 select coalesce(jsonb_agg(x order by x.seq desc),'[]') into result from (select c.id,c.seq,c.community_id,c.target_type,c.target_id,c.subject_id,c.status,case when c.retain_until>now() then c.reason else 'Report details expired' end reason,case when c.retain_until>now() then c.evidence else null end evidence,c.retain_until,coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'filename',m.filename,'mime',m.mime)) from private.case_media m where m.case_id=c.id and c.retain_until>now()),'[]') media,c.reviewed_by,c.reviewed_at,c.created_at from private.moderation_cases c where private.case_access(c) and (p_community is null or c.community_id=p_community) and (p_before is null or c.seq<p_before) order by c.seq desc limit 30)x;
 insert into private.admin_audit(actor_id,community_id,action,reason) values(auth.uid(),p_community,'evidence.review','Opened the scoped moderation queue');return result;
 elsif p_view='audit' then
 select coalesce(jsonb_agg(x order by x.id desc),'[]') into result from (select id,actor_id,community_id,action,target_id,reason,created_at from private.admin_audit where ((p_community is null and pr>=20) or community_id=p_community) and (p_community is null or community_id=p_community) and (p_before is null or id<p_before) order by id desc limit 30)x;return result;
 elsif p_view='appeals' then
 select coalesce(jsonb_agg(x order by x.seq desc),'[]') into result from (select a.* from public.moderation_appeals a left join private.moderation_cases c on c.id=a.case_id where (pr>=30 or (cr>=30 and c.community_id=p_community and c.target_type<>'dm')) and (p_community is null or c.community_id=p_community) and (p_before is null or a.seq<p_before) order by a.seq desc limit 30)x;return result;
 elsif p_view='communities' then
 select coalesce(jsonb_agg(x),'[]') into result from (select c.*,coalesce(s.guidelines,'Be kind. Respect privacy. Welcome others.') guidelines,coalesce(s.allow_events,true) allow_events,coalesce(s.allow_prayers,true) allow_prayers from public.communities c left join public.community_settings s on s.community_id=c.id where ((p_community is null and pr>=20) or c.id=p_community) order by c.name limit 100)x;return result;
 elsif p_view='channels' then
 select coalesce(jsonb_agg(x order by x.position,x.name),'[]') into result from (select c.id,c.community_id,c.name,c.description,c.kind,c.is_private,c.position,c.disabled,v.participant_limit,v.locked,(select coalesce(jsonb_agg(jsonb_build_object('user_id',vs.user_id,'username',p.username)),'[]') from private.voice_sessions vs join public.profiles p on p.id=vs.user_id where vs.channel_id=c.id and vs.expires_at>now()) participants from public.channels c left join public.voice_rooms v on v.channel_id=c.id where c.community_id=p_community order by c.position,c.name limit 200)x;return result;
 elsif p_view='events' then
 select coalesce(jsonb_agg(x order by x.seq desc),'[]') into result from (select id,seq,title,community_id,host_id,status,starts_at,moderation_hidden from public.events where ((p_community is null and pr>=20) or community_id=p_community) and (p_community is null or community_id=p_community) and (p_before is null or seq<p_before) order by seq desc limit 30)x;return result;
 elsif p_view='announcements' then
 select coalesce(jsonb_agg(x),'[]') into result from (select * from public.site_announcements where ((p_community is null and pr>=20) or community_id=p_community) and (p_community is null or community_id=p_community) order by updated_at desc limit 50)x;return result;
 end if;raise exception 'Unknown view' using errcode='22023';end$$;

notify pgrst,'reload schema';

$migration$;
 INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES('202610310001','launch_operations');
 ELSE RAISE NOTICE 'Phase 12 already recorded; skipped.'; END IF;
END $install$;
COMMIT;
