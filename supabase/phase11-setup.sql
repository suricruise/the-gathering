-- Phase 11: safe pending-only installation after Phase 10.
-- Copy the entire file into Supabase SQL Editor; recorded versions are skipped.
BEGIN;
SELECT pg_advisory_xact_lock(20261030);
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations(version text PRIMARY KEY,statements text[],name text);
REVOKE ALL ON SCHEMA supabase_migrations FROM public,anon,authenticated;
REVOKE ALL ON supabase_migrations.schema_migrations FROM public,anon,authenticated;
DO $preflight$ BEGIN
 IF to_regprocedure('public.space_command(text,jsonb)') IS NULL THEN RAISE EXCEPTION 'Install Phase 10 first.'; END IF;
 IF (to_regclass('private.platform_roles') IS NOT NULL OR to_regclass('private.moderation_cases') IS NOT NULL) AND NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='202610300001') THEN RAISE EXCEPTION 'Phase 11 tables exist without a migration record. Stop and inspect migration history; no tables were changed.'; END IF;
END $preflight$;

DO $install$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='202610300001') THEN
 EXECUTE $migration$
-- Phase 11: roles are provisioned separately from community membership.
create table private.platform_roles(user_id uuid primary key references auth.users on delete cascade, role text not null check(role in ('owner','administrator','moderator')),granted_at timestamptz not null default now());
create unique index one_platform_owner on private.platform_roles(role) where role='owner';
create table private.admin_settings(id boolean primary key default true check(id),evidence_days integer not null default 90 check(evidence_days between 7 and 365));
insert into private.admin_settings values(true,90);
create table private.admin_audit(id bigint generated always as identity primary key,actor_id uuid references auth.users on delete set null,community_id uuid references public.communities on delete set null,action text not null,target_id uuid,reason text not null check(length(reason) between 5 and 500),created_at timestamptz not null default now());
create index admin_audit_page on private.admin_audit(id desc);
create table private.moderation_cases(id uuid primary key default gen_random_uuid(),seq bigint generated always as identity unique,reporter_id uuid references auth.users on delete set null,community_id uuid references public.communities on delete set null,target_type text not null check(target_type in ('message','post','comment','user','session','dm')),target_id uuid not null,subject_id uuid references auth.users on delete set null,reason text not null check(length(reason) between 5 and 1000),status text not null default 'open' check(status in ('open','dismissed','actioned')),evidence text check(length(evidence)<=5000),retain_until timestamptz not null,reviewed_by uuid references auth.users on delete set null,reviewed_at timestamptz,created_at timestamptz not null default now(),unique(reporter_id,target_type,target_id));
create index moderation_cases_page on private.moderation_cases(seq desc);
create table public.moderation_appeals(id uuid primary key default gen_random_uuid(),seq bigint generated always as identity unique,user_id uuid not null references auth.users on delete cascade,case_id uuid references private.moderation_cases on delete set null,body text not null check(length(btrim(body)) between 10 and 2000),status text not null default 'pending' check(status in ('pending','accepted','declined')),decision text check(length(decision)<=500),reviewed_by uuid references auth.users on delete set null,created_at timestamptz not null default now(),reviewed_at timestamptz);
create unique index appeal_pending on public.moderation_appeals(user_id) where status='pending';
create table public.site_announcements(id uuid primary key default gen_random_uuid(),title text not null check(length(btrim(title)) between 3 and 100),body text not null check(length(btrim(body)) between 1 and 3000),community_id uuid references public.communities on delete cascade,published boolean not null default false,expires_at timestamptz not null default now()+interval '7 days',created_by uuid references auth.users on delete set null,updated_at timestamptz not null default now());
create table public.community_settings(community_id uuid primary key references public.communities on delete cascade,guidelines text not null default 'Be kind. Respect privacy. Welcome others.' check(length(guidelines) between 5 and 3000),allow_events boolean not null default true,allow_prayers boolean not null default true);
alter table public.communities add column archived boolean not null default false;
alter table public.channels add column disabled boolean not null default false;
alter table public.events add column moderation_hidden boolean not null default false;
do $$declare t text;begin foreach t in array array['platform_roles','admin_settings','admin_audit','moderation_cases'] loop execute format('alter table private.%I enable row level security',t);execute format('revoke all on private.%I from public,anon,authenticated',t);end loop;end$$;
alter table public.moderation_appeals enable row level security;
alter table public.site_announcements enable row level security;
alter table public.community_settings enable row level security;
revoke all on public.moderation_appeals,public.site_announcements,public.community_settings from public,anon,authenticated;
grant select on public.moderation_appeals,public.site_announcements,public.community_settings to authenticated;
create policy own_appeals on public.moderation_appeals for select to authenticated using(user_id=auth.uid());
create policy announcements_read on public.site_announcements for select to authenticated using(private.is_verified_member() and published and expires_at>now() and (community_id is null or private.community_rank(community_id)>0));
create policy community_settings_read on public.community_settings for select to authenticated using(private.community_rank(community_id)>0);
create function private.platform_rank() returns integer language sql stable security definer set search_path='' as $$select case when private.is_verified_member() then coalesce((select case role when 'owner' then 40 when 'administrator' then 30 else 20 end from private.platform_roles where user_id=auth.uid()),0) else 0 end$$;
create function private.admin_community_rank(cid uuid) returns integer language sql stable security definer set search_path='' as $$select coalesce((select r.rank from public.community_members m join public.community_roles r on r.id=m.role_id where m.community_id=cid and m.user_id=auth.uid() and m.status='active' and private.is_verified_member()),0)$$;
create function private.case_access(c private.moderation_cases) returns boolean language sql stable security definer set search_path='' as $$select private.platform_rank()>=20 or (c.community_id is not null and c.target_type<>'dm' and private.admin_community_rank(c.community_id)>=20)$$;
-- Operational disable/archive gates cover direct reads, RPCs and worker checks.
alter function public.channel_access(uuid,text) rename to phase10_channel_access;
revoke all on function public.phase10_channel_access(uuid,text) from public,anon,authenticated;
create function public.channel_access(p_channel uuid,p_permission text default 'view') returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.channels c join public.communities g on g.id=c.community_id where c.id=p_channel and not c.disabled and not g.archived) and public.phase10_channel_access(p_channel,p_permission)$$;
grant execute on function public.channel_access(uuid,text) to authenticated;
revoke all on function public.channel_access(uuid,text) from public,anon;
alter function public.community_access(uuid) rename to phase10_community_access;
revoke all on function public.phase10_community_access(uuid) from public,anon,authenticated;
create function public.community_access(p_community uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.communities where id=p_community and not archived) and public.phase10_community_access(p_community)$$;
revoke all on function public.community_access(uuid) from public,anon;
grant execute on function public.community_access(uuid) to authenticated;
alter function private.community_rank(uuid) rename to phase10_community_rank;
create function private.community_rank(p_community uuid) returns integer language sql stable security definer set search_path='' as $$select case when exists(select 1 from public.communities where id=p_community and not archived) then private.phase10_community_rank(p_community) else 0 end$$;
revoke all on function private.phase10_community_rank(uuid),private.community_rank(uuid) from public,anon,authenticated;
grant execute on function private.community_rank(uuid) to authenticated;
alter function private.space_rank(uuid,uuid) rename to phase10_space_rank;
create function private.space_rank(u uuid,c uuid) returns integer language sql stable security definer set search_path='' as $$select case when exists(select 1 from public.communities where id=c and not archived) then private.phase10_space_rank(u,c) else 0 end$$;
alter function private.voice_allowed(uuid,uuid) rename to phase10_voice_allowed;
create function private.voice_allowed(p_user uuid,p_channel uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.channels c join public.communities g on g.id=c.community_id where c.id=p_channel and not c.disabled and not g.archived) and private.phase10_voice_allowed(p_user,p_channel)$$;
alter function private.channel_user_allowed(uuid,uuid) rename to phase10_channel_user_allowed;
create function private.channel_user_allowed(u uuid,cid uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.channels where id=cid and not disabled) and private.phase10_channel_user_allowed(u,cid)$$;
alter function private.event_allowed(uuid,uuid) rename to phase10_event_allowed;
create function private.event_allowed(u uuid,e uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.events where id=e and not moderation_hidden) and private.phase10_event_allowed(u,e)$$;
-- Existing public community writes must also respect archive and shared role locks.
alter function public.community_command(text,uuid,jsonb) rename to phase10_community_command;
revoke all on function public.phase10_community_command(text,uuid,jsonb) from public,anon,authenticated;
create function public.community_command(p_operation text,p_community uuid default null,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$begin
 perform pg_advisory_xact_lock(20261030);
 if exists(select 1 from public.communities where id=p_community and archived) then raise exception 'Community archived' using errcode='42501';end if;
 return public.phase10_community_command(p_operation,p_community,p_data);
end$$;
revoke all on function public.community_command(text,uuid,jsonb) from public,anon;
grant execute on function public.community_command(text,uuid,jsonb) to authenticated;
-- Legacy post/DM report forms feed the same protected queue without broad DM access.
create function private.capture_legacy_report() returns trigger language plpgsql security definer set search_path='' as $$declare cid uuid;subject uuid;txt text;typ text;tid uuid;why text;begin
 if tg_table_name='post_reports' then
 select community_id,author_id,body into cid,subject,txt from public.posts where id=new.post_id;typ:='post';tid:=new.post_id;why:=new.reason||': '||new.detail;
 if new.comment_id is not null then select author_id,body into subject,txt from public.post_comments where id=new.comment_id;typ:='comment';tid:=new.comment_id;end if;
 else select sender_id,body into subject,txt from public.direct_messages where id=new.message_id;typ:='dm';tid:=new.message_id;why:=new.reason;end if;
 insert into private.moderation_cases(reporter_id,community_id,target_type,target_id,subject_id,reason,evidence,retain_until) values(new.reporter_id,cid,typ,tid,subject,left(why,1000),left(txt,5000),now()+make_interval(days=>(select evidence_days from private.admin_settings))) on conflict do nothing;return new;
end$$;
create trigger central_post_report after insert on public.post_reports for each row execute function private.capture_legacy_report();
create trigger central_dm_report after insert on public.direct_message_reports for each row execute function private.capture_legacy_report();
-- New reports never accept evidence or reporter identity from the client.
create function public.submit_report(p_type text,p_target uuid,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$declare cid uuid;subject uuid;txt text;rid uuid;begin
 if not private.is_verified_member() or length(btrim(p_reason)) not between 5 and 1000 then raise exception 'Not authorized' using errcode='42501';end if;
 if not private.take_limit('report:'||auth.uid()::text,10,3600) then raise exception 'Report limit' using errcode='42501';end if;
 case p_type
 when 'message' then select c.community_id,m.author_id,m.body into cid,subject,txt from public.messages m join public.channels c on c.id=m.channel_id where m.id=p_target and m.deleted_at is null and public.channel_access(c.id);
 when 'post' then select community_id,author_id,body into cid,subject,txt from public.posts where id=p_target and public.post_access(id);
 when 'session' then select community_id,host_id,description into cid,subject,txt from public.gaming_sessions where id=p_target and public.squad_access(id);
 when 'user' then select null::uuid,p.id,p.username into cid,subject,txt from public.profiles p where p.id=p_target and p.id<>auth.uid() and (exists(select 1 from public.friendships where low_id=least(auth.uid(),p.id) and high_id=greatest(auth.uid(),p.id) and status='accepted') or exists(select 1 from public.community_members a join public.community_members b using(community_id) where a.user_id=auth.uid() and b.user_id=p.id and a.status='active' and b.status='active'));
 else raise exception 'Invalid report type' using errcode='22023';end case;
 if not found then raise exception 'Target unavailable' using errcode='42501';end if;
 insert into private.moderation_cases(reporter_id,community_id,target_type,target_id,subject_id,reason,evidence,retain_until) values(auth.uid(),cid,p_type,p_target,subject,btrim(p_reason),left(txt,5000),now()+make_interval(days=>(select evidence_days from private.admin_settings))) on conflict(reporter_id,target_type,target_id) do update set reporter_id=excluded.reporter_id returning id into rid;return rid;
end$$;
-- Content feature settings apply to legacy RPC callers as well as the dashboard.
create function private.space_feature_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_op='INSERT' and (exists(select 1 from public.communities where id=new.community_id and archived) or exists(select 1 from public.community_settings where community_id=new.community_id and case when tg_table_name='events' then not allow_events else not allow_prayers end)) then raise exception 'Community feature disabled' using errcode='42501';end if;return new;end$$;
create trigger event_feature_guard before insert on public.events for each row execute function private.space_feature_guard();
create trigger prayer_feature_guard before insert on public.prayer_requests for each row execute function private.space_feature_guard();
-- Service-only retention job drops body/evidence, preserving minimal action metadata.
create function public.moderation_cleanup() returns integer language plpgsql security definer set search_path='' as $$declare n integer;begin
 update private.moderation_cases set evidence=null,reason='Report details expired' where retain_until<=now() and (evidence is not null or reason<>'Report details expired');get diagnostics n=row_count;
 update public.moderation_appeals set body='Appeal details expired',decision=null where created_at<now()-interval '365 days' and status<>'pending';return n;end$$;
revoke all on function private.platform_rank(),private.admin_community_rank(uuid),private.case_access(private.moderation_cases),private.space_rank(uuid,uuid),private.phase10_space_rank(uuid,uuid),private.voice_allowed(uuid,uuid),private.phase10_voice_allowed(uuid,uuid),private.channel_user_allowed(uuid,uuid),private.phase10_channel_user_allowed(uuid,uuid),private.event_allowed(uuid,uuid),private.phase10_event_allowed(uuid,uuid),private.capture_legacy_report(),private.space_feature_guard(),public.moderation_cleanup(),public.submit_report(text,uuid,text) from public,anon,authenticated;
grant execute on function public.moderation_cleanup() to service_role;
grant execute on function public.submit_report(text,uuid,text) to authenticated;
notify pgrst,'reload schema';

$migration$;
 INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES('202610300001','administration');
 ELSE RAISE NOTICE 'Migration 202610300001 already recorded; skipped.'; END IF;
END $install$;

DO $install$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='202610300002') THEN
 EXECUTE $migration$
create function public.admin_read(p_view text default 'overview',p_community uuid default null,p_before bigint default null,p_search text default '') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare pr integer:=private.platform_rank();cr integer:=private.admin_community_rank(p_community);result jsonb;begin
 if not private.is_verified_member() or length(p_search)>48 or (p_before is not null and p_before<1) then raise exception 'Not authorized' using errcode='42501';end if;
 if p_view='context' then return jsonb_build_object('rank',pr,'communities',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'rank',private.admin_community_rank(c.id),'archived',c.archived) order by c.name) from public.communities c where pr>=20 or private.admin_community_rank(c.id)>=20),'[]'),'retention_days',case when pr>=30 then (select evidence_days from private.admin_settings) else null end);end if;
 if pr<20 and cr<20 then raise exception 'Not authorized' using errcode='42501';end if;
 if not private.take_limit('admin-read:'||auth.uid()::text,300,900) then raise exception 'Rate limited' using errcode='42501';end if;
 if p_view='overview' then return jsonb_build_object('members',(select count(*) from public.profiles p where (p_community is null and pr>=20) or exists(select 1 from public.community_members m where m.user_id=p.id and m.community_id=p_community)),'communities',(select count(*) from public.communities where (p_community is null and pr>=20) or id=p_community),'messages_7d',(select count(*) from public.messages m join public.channels c on c.id=m.channel_id where m.created_at>now()-interval '7 days' and ((p_community is null and pr>=20) or c.community_id=p_community)),'open_reports',(select count(*) from private.moderation_cases c where c.status='open' and private.case_access(c) and (p_community is null or c.community_id=p_community)),'voice_admissions',(select count(*) from private.voice_sessions v join public.channels c on c.id=v.channel_id where v.expires_at>now() and ((p_community is null and pr>=20) or c.community_id=p_community)),'posts_7d',(select count(*) from public.posts where created_at>now()-interval '7 days' and ((p_community is null and pr>=20) or community_id=p_community)));end if;
 if p_view='members' then
 select coalesce(jsonb_agg(x order by x.username),'[]') into result from (select p.id,p.username,p.display_name,case when pr>=20 then case when u.banned_until>now() then 'restricted' else 'active' end else m.status end status,case when pr>=20 then r.role else null end platform_role,m.role_id community_role from public.profiles p join auth.users u on u.id=p.id left join private.platform_roles r on r.user_id=p.id left join public.community_members m on m.user_id=p.id and m.community_id=p_community where ((p_community is null and pr>=20) or m.community_id=p_community) and (p_search='' or p.username ilike replace(replace(p_search,'%',''), '_','')||'%') order by p.username limit 50)x;return result;
 elsif p_view='reports' then
 select coalesce(jsonb_agg(x order by x.seq desc),'[]') into result from (select c.id,c.seq,c.community_id,c.target_type,c.target_id,c.subject_id,c.status,case when c.retain_until>now() then c.reason else 'Report details expired' end reason,case when c.retain_until>now() then c.evidence else null end evidence,c.retain_until,c.reviewed_by,c.reviewed_at,c.created_at from private.moderation_cases c where private.case_access(c) and (p_community is null or c.community_id=p_community) and (p_before is null or c.seq<p_before) order by c.seq desc limit 30)x;
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
-- Evidence reads write an audit entry: this RPC must be VOLATILE.
alter function public.admin_read(text,uuid,bigint,text) volatile;
create function public.admin_command(p_operation text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();pr integer;cr integer;cid uuid:=nullif(p_data->>'community_id','')::uuid;tid uuid:=nullif(p_data->>'id','')::uuid;target uuid:=nullif(p_data->>'user_id','')::uuid;why text:=btrim(p_data->>'reason');tr integer;desired text;case_row private.moderation_cases;ch public.channels;aid uuid;begin
 perform pg_advisory_xact_lock(20261030);
 pr:=private.platform_rank();cr:=private.admin_community_rank(cid);
 if not private.is_verified_member() or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>16000 or why is null or length(why) not between 5 and 500 then raise exception 'Invalid or unauthorized action' using errcode='42501';end if;
 if not private.take_limit('admin:'||actor::text,120,900) then raise exception 'Rate limited' using errcode='42501';end if;
 -- Every branch authorizes inside this transaction. No role/id comes from session metadata.
 if p_operation='platform_role' then
  desired:=p_data->>'role';
  if pr<>40 or target=actor or target is null or desired not in ('administrator','moderator','member') or exists(select 1 from private.platform_roles where user_id=target and role='owner') or not private.squad_live(target) then raise exception 'Not authorized' using errcode='42501';end if;
  if desired='member' then delete from private.platform_roles where user_id=target;else insert into private.platform_roles(user_id,role) values(target,desired) on conflict(user_id) do update set role=excluded.role,granted_at=now();end if;
 elsif p_operation='account_status' then
  select case role when 'owner' then 40 when 'administrator' then 30 else 20 end into tr from private.platform_roles where user_id=target;
  if pr<30 or target=actor or target is null or coalesce(tr,0)>=pr or p_data->>'status' not in ('active','suspended','banned') then raise exception 'Not authorized' using errcode='42501';end if;
  update auth.users set banned_until=case p_data->>'status' when 'banned' then 'infinity'::timestamptz when 'suspended' then now()+make_interval(days=>greatest(1,least(365,coalesce((p_data->>'days')::integer,7)))) else null end where id=target and deleted_at is null;
  if not found then raise exception 'Not authorized' using errcode='42501';end if;
  delete from private.voice_sessions where user_id=target;delete from private.squad_voice_sessions where user_id=target;
 elsif p_operation='community' then
  if pr<30 and cr<30 then raise exception 'Not authorized' using errcode='42501';end if;
  if cid is null then
   if pr<30 or target is null or not private.squad_live(target) then raise exception 'Not authorized' using errcode='42501';end if;
   insert into public.communities(slug,name,description,visibility,cover,created_by) values(p_data->>'slug',p_data->>'name',p_data->>'description',p_data->>'visibility','nebula',actor) returning id into cid;
   insert into public.community_members(community_id,user_id,role_id) values(cid,target,'owner');insert into public.channels(community_id,name) values(cid,'general');
  else
   update public.communities set name=p_data->>'name',description=p_data->>'description',visibility=p_data->>'visibility',archived=(p_data->>'archived')::boolean where id=cid;
   if not found then raise exception 'Not authorized' using errcode='42501';end if;
  end if;
 elsif p_operation='community_settings' then
  if pr<30 and cr<30 then raise exception 'Not authorized' using errcode='42501';end if;
  insert into public.community_settings(community_id,guidelines,allow_events,allow_prayers) values(cid,p_data->>'guidelines',(p_data->>'allow_events')::boolean,(p_data->>'allow_prayers')::boolean) on conflict(community_id) do update set guidelines=excluded.guidelines,allow_events=excluded.allow_events,allow_prayers=excluded.allow_prayers;
 elsif p_operation='community_role' then
  select r.rank into tr from public.community_members m join public.community_roles r on r.id=m.role_id where m.user_id=target and m.community_id=cid;
  desired:=p_data->>'role';
  if target=actor or tr is null or desired not in ('administrator','moderator','member') or (pr<30 and (cr<30 or tr>=cr or (select rank from public.community_roles where id=desired)>=cr)) or tr=40 then raise exception 'Not authorized' using errcode='42501';end if;
  update public.community_members set role_id=desired where user_id=target and community_id=cid and status='active';if not found then raise exception 'Not authorized' using errcode='42501';end if;
 elsif p_operation='community_status' then
  select r.rank into tr from public.community_members m join public.community_roles r on r.id=m.role_id where m.user_id=target and m.community_id=cid;
  if target=actor or tr is null or tr=40 or (pr<30 and (cr<20 or tr>=cr)) or p_data->>'status' not in ('active','banned') then raise exception 'Not authorized' using errcode='42501';end if;
  update public.community_members set role_id='member',status=p_data->>'status' where user_id=target and community_id=cid;
 elsif p_operation='channel' then
  if pr<30 and cr<30 then raise exception 'Not authorized' using errcode='42501';end if;
  if tid is null then insert into public.channels(community_id,name,description,kind,is_private,position,disabled) values(cid,p_data->>'name',p_data->>'description',p_data->>'kind',(p_data->>'is_private')::boolean,(p_data->>'position')::integer,(p_data->>'disabled')::boolean) returning id into tid;
  else update public.channels set name=p_data->>'name',description=p_data->>'description',is_private=(p_data->>'is_private')::boolean,position=(p_data->>'position')::integer,disabled=(p_data->>'disabled')::boolean where id=tid and community_id=cid;if not found then raise exception 'Not authorized' using errcode='42501';end if;end if;
 elsif p_operation='channel_access' then
  if pr<30 and cr<30 then raise exception 'Not authorized' using errcode='42501';end if;
  if not exists(select 1 from public.channels where id=tid and community_id=cid) or p_data->>'role' not in ('member','moderator','administrator') then raise exception 'Not authorized' using errcode='42501';end if;
  delete from public.channel_permission_overrides where channel_id=tid and role_id=p_data->>'role';
  if not coalesce((p_data->>'reset')::boolean,false) then insert into public.channel_permission_overrides(community_id,channel_id,role_id,can_view,can_post,can_connect) values(cid,tid,p_data->>'role',(p_data->>'can_view')::boolean,(p_data->>'can_post')::boolean,(p_data->>'can_connect')::boolean);end if;
 elsif p_operation='voice_remove' then
  select * into ch from public.channels where id=tid and community_id=cid and kind='voice';
  select r.rank into tr from public.community_members m join public.community_roles r on r.id=m.role_id where m.community_id=cid and m.user_id=target;
  if ch.id is null or target is null or target=actor or (pr<20 and (cr<20 or coalesce(tr,40)>=cr)) or exists(select 1 from private.platform_roles where user_id=target and (case role when 'owner' then 40 when 'administrator' then 30 else 20 end)>=pr) then raise exception 'Not authorized' using errcode='42501';end if;
  insert into private.voice_suspensions values(tid,target,now()+interval '15 minutes') on conflict(channel_id,user_id) do update set until_at=excluded.until_at;
  delete from private.voice_sessions where channel_id=tid and user_id=target;
 elsif p_operation='event_visibility' then
  if pr<20 and cr<20 then raise exception 'Not authorized' using errcode='42501';end if;
  update public.events set moderation_hidden=(p_data->>'hidden')::boolean where id=tid and community_id=cid;if not found then raise exception 'Not authorized' using errcode='42501';end if;
 elsif p_operation='announcement' then
  if (cid is null and pr<30) or (cid is not null and pr<30 and cr<30) then raise exception 'Not authorized' using errcode='42501';end if;
  if tid is null then tid:=gen_random_uuid();end if;
  if exists(select 1 from public.site_announcements where id=tid and community_id is distinct from cid) then raise exception 'Not authorized' using errcode='42501';end if;
  insert into public.site_announcements(id,title,body,community_id,published,expires_at,created_by) values(tid,p_data->>'title',p_data->>'body',cid,(p_data->>'published')::boolean,(p_data->>'expires_at')::timestamptz,actor) on conflict(id) do update set title=excluded.title,body=excluded.body,published=excluded.published,expires_at=excluded.expires_at,updated_at=now();
 elsif p_operation='retention' then
  if pr<30 then raise exception 'Not authorized' using errcode='42501';end if;
  update private.admin_settings set evidence_days=(p_data->>'days')::integer;
  update private.moderation_cases set retain_until=least(retain_until,created_at+make_interval(days=>(p_data->>'days')::integer));
 elsif p_operation='case_decision' then
  select * into case_row from private.moderation_cases where id=tid for update;
  if not found or not private.case_access(case_row) or case_row.reporter_id=actor or case_row.subject_id=actor or p_data->>'decision' not in ('dismissed','actioned') then raise exception 'Not authorized' using errcode='42501';end if;
  cid:=case_row.community_id;
  if pr<20 and (p_data->>'decision'='actioned' or coalesce((p_data->>'remove')::boolean,false)) and case_row.subject_id is not null and coalesce((select r.rank from public.community_members m join public.community_roles r on r.id=m.role_id where m.community_id=cid and m.user_id=case_row.subject_id),0)>=private.admin_community_rank(cid) then raise exception 'Cannot action a peer or superior' using errcode='42501';end if;
  if coalesce((p_data->>'remove')::boolean,false) then
   if p_data->>'decision'<>'actioned' then raise exception 'Choose actioned before removing content' using errcode='22023';end if;
   if case_row.subject_id is not null and exists(select 1 from private.platform_roles where user_id=case_row.subject_id and (case role when 'owner' then 40 when 'administrator' then 30 else 20 end)>=pr) then raise exception 'Not authorized' using errcode='42501';end if;
   if case_row.target_type='message' then update public.messages set body='',deleted_at=now() where id=case_row.target_id;update public.message_attachments set removed_at=now() where message_id=case_row.target_id;
   elsif case_row.target_type='post' then update public.posts set status='removed',body='' where id=case_row.target_id;update public.post_media set removed_at=now() where post_id=case_row.target_id;
   elsif case_row.target_type='comment' then update public.post_comments set status='removed',body='' where id=case_row.target_id;
   elsif case_row.target_type='session' then update public.gaming_sessions set status='cancelled' where id=case_row.target_id;
   else raise exception 'Use account controls for users; DM evidence is review-only' using errcode='22023';end if;
  end if;
  update private.moderation_cases set status=p_data->>'decision',reviewed_by=actor,reviewed_at=now() where id=tid;
  if case_row.target_type in ('post','comment') then update public.post_reports set status=p_data->>'decision',reviewed_at=now() where (case_row.target_type='post' and post_id=case_row.target_id and comment_id is null) or comment_id=case_row.target_id;
  elsif case_row.target_type='dm' then update public.direct_message_reports set status=p_data->>'decision' where message_id=case_row.target_id;end if;
 elsif p_operation='appeal_decision' then
  select c.* into case_row from public.moderation_appeals a left join private.moderation_cases c on c.id=a.case_id where a.id=tid;
  if pr<30 and (private.admin_community_rank(case_row.community_id)<30 or case_row.target_type='dm') then raise exception 'Not authorized' using errcode='42501';end if;
  if p_data->>'decision' not in ('accepted','declined') or exists(select 1 from public.moderation_appeals where id=tid and user_id=actor) then raise exception 'Not authorized' using errcode='42501';end if;
  update public.moderation_appeals set status=p_data->>'decision',decision=why,reviewed_by=actor,reviewed_at=now() where id=tid and status='pending';if not found then raise exception 'Not authorized' using errcode='42501';end if;cid:=case_row.community_id;
 else raise exception 'Unknown operation' using errcode='22023';end if;
 insert into private.admin_audit(actor_id,community_id,target_id,action,reason) values(actor,cid,coalesce(target,tid),p_operation,why);
 return jsonb_build_object('ok',true,'id',coalesce(tid,cid));end$$;
create function public.submit_appeal(p_body text,p_case uuid default null) returns uuid language plpgsql security definer set search_path='' as $$declare rid uuid;begin
 -- Banned sessions may appeal, but gain no ordinary member or admin access.
 if not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null and deleted_at is null) or length(btrim(p_body)) not between 10 and 2000 or (p_case is not null and not exists(select 1 from private.moderation_cases where id=p_case and subject_id=auth.uid())) then raise exception 'Not authorized' using errcode='42501';end if;
 if not private.take_limit('appeal:'||auth.uid()::text,3,86400) then raise exception 'Rate limited' using errcode='42501';end if;
 insert into public.moderation_appeals(user_id,case_id,body) values(auth.uid(),p_case,btrim(p_body)) returning id into rid;return rid;end$$;
revoke all on function public.admin_read(text,uuid,bigint,text),public.admin_command(text,jsonb),public.submit_appeal(text,uuid) from public,anon,authenticated;
grant execute on function public.admin_read(text,uuid,bigint,text),public.admin_command(text,jsonb),public.submit_appeal(text,uuid) to authenticated;
notify pgrst,'reload schema';

$migration$;
 INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES('202610300002','admin_operations');
 ELSE RAISE NOTICE 'Migration 202610300002 already recorded; skipped.'; END IF;
END $install$;

DO $install$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='202610300003') THEN
 EXECUTE $migration$
-- Policies bind function OIDs: explicitly repoint them after versioned wrappers.
do $$declare p record;expr text;chk text;begin
 for p in select pol.polname,n.nspname,c.relname,pg_get_expr(pol.polqual,pol.polrelid) qual,pg_get_expr(pol.polwithcheck,pol.polrelid) chk from pg_policy pol join pg_class c on c.oid=pol.polrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','storage','realtime') loop
 expr:=replace(replace(p.qual,'phase10_channel_access','channel_access'),'phase10_community_rank','community_rank');expr:=replace(expr,'phase10_community_access','community_access');
 chk:=replace(replace(p.chk,'phase10_channel_access','channel_access'),'phase10_community_rank','community_rank');chk:=replace(chk,'phase10_community_access','community_access');
 if expr is distinct from p.qual or chk is distinct from p.chk then execute format('alter policy %I on %I.%I%s%s',p.polname,p.nspname,p.relname,case when expr is null then '' else ' using ('||expr||')' end,case when chk is null then '' else ' with check ('||chk||')' end);end if;
 end loop;end$$;
alter function private.squad_eligible(uuid,public.gaming_sessions) rename to phase10_squad_eligible;
create function private.squad_eligible(p_user uuid,s public.gaming_sessions) returns boolean language sql stable security definer set search_path='' as $$select (s.community_id is null or exists(select 1 from public.communities where id=s.community_id and not archived)) and private.phase10_squad_eligible(p_user,s)$$;
revoke all on function private.squad_eligible(uuid,public.gaming_sessions),private.phase10_squad_eligible(uuid,public.gaming_sessions) from public,anon,authenticated;
-- Immutable, bounded evidence snapshots: no storage URLs, emails or conversation histories.
-- Historical reports are imported once; future inserts are captured transactionally.
insert into private.moderation_cases(reporter_id,community_id,target_type,target_id,subject_id,reason,evidence,retain_until,status)
select r.reporter_id,p.community_id,case when r.comment_id is null then 'post' else 'comment' end,coalesce(r.comment_id,r.post_id),coalesce(c.author_id,p.author_id),left(r.reason||': '||r.detail,1000),left(coalesce(c.body,p.body),5000),now()+interval '90 days',r.status from public.post_reports r join public.posts p on p.id=r.post_id left join public.post_comments c on c.id=r.comment_id on conflict do nothing;
insert into private.moderation_cases(reporter_id,target_type,target_id,subject_id,reason,evidence,retain_until,status)
select r.reporter_id,'dm',r.message_id,m.sender_id,r.reason,m.body,now()+interval '90 days',case when r.status in ('pending','reviewed') then 'open' else r.status end from public.direct_message_reports r join public.direct_messages m on m.id=r.message_id on conflict do nothing;
-- Include Phase 4 membership/settings actions and earlier moderation surfaces in central history.
create function private.central_community_audit() returns trigger language plpgsql security definer set search_path='' as $$begin
 insert into private.admin_audit(actor_id,community_id,target_id,action,reason) values(new.actor_id,new.community_id,new.target_id,'community.'||new.action,'Existing community control: '||left(new.action,100));return new;end$$;
create trigger central_community_audit after insert on public.community_audit_log for each row execute function private.central_community_audit();
-- Content removal may not target a community peer/superior through report review.
create function private.case_hierarchy_guard() returns trigger language plpgsql security definer set search_path='' as $$declare r integer;begin
 if new.status='actioned' and old.status is distinct from new.status and private.platform_rank()<20 and new.subject_id is not null then
 r:=coalesce((select cr.rank from public.community_members m join public.community_roles cr on cr.id=m.role_id where m.community_id=new.community_id and m.user_id=new.subject_id),0);
 if r>=private.admin_community_rank(new.community_id) then raise exception 'Cannot action a peer or superior' using errcode='42501';end if;end if;return new;end$$;
create trigger case_hierarchy_guard before update on private.moderation_cases for each row execute function private.case_hierarchy_guard();
revoke all on function private.central_community_audit(),private.case_hierarchy_guard() from public,anon,authenticated;
notify pgrst,'reload schema';

$migration$;
 INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES('202610300003','admin_guards');
 ELSE RAISE NOTICE 'Migration 202610300003 already recorded; skipped.'; END IF;
END $install$;

DO $install$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='202610300004') THEN
 EXECUTE $migration$
-- Legacy moderation remains functional while feeding one central action history.
create function private.central_content_audit() returns trigger language plpgsql security definer set search_path='' as $$declare cid uuid;tid uuid;why text;begin
 if tg_table_name='social_audit' then select community_id into cid from public.posts where id=new.post_id;tid:=coalesce(new.comment_id,new.post_id);why:='Reported social content review: '||left(new.action,100);
 elsif tg_table_name='message_moderation' then select c.community_id into cid from public.messages m join public.channels c on c.id=m.channel_id where m.id=new.message_id;tid:=new.message_id;why:='Channel message moderation: '||coalesce(nullif(new.reason,''),left(new.action,100));
 else cid:=new.community_id;tid:=new.resource_id;why:='Faith/event moderation: '||coalesce(nullif(new.reason,''),left(new.action,100));end if;
 insert into private.admin_audit(actor_id,community_id,target_id,action,reason,created_at) values(new.actor_id,cid,tid,'legacy.'||new.action,left(why,500),new.created_at);return new;end$$;
create trigger central_space_audit after insert on private.space_audit for each row execute function private.central_content_audit();
create trigger central_social_audit after insert on private.social_audit for each row execute function private.central_content_audit();
create trigger central_message_audit after insert on private.message_moderation for each row execute function private.central_content_audit();
-- Archived invitations cannot add members even when the bearer command omits its community argument.
create function private.archived_membership_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 if exists(select 1 from public.communities where id=new.community_id and archived) then raise exception 'Community archived' using errcode='42501';end if;return new;end$$;
create trigger archived_membership_guard before insert on public.community_members for each row execute function private.archived_membership_guard();
-- An operator may lodge a verified external appeal for a member unable to sign in.
-- It cannot restore access, assign roles or fabricate a member's authentication.
alter function public.admin_command(text,jsonb) rename to phase11_admin_command;
revoke all on function public.phase11_admin_command(text,jsonb) from public,anon,authenticated;
create function public.admin_command(p_operation text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$declare rid uuid;begin
 if p_operation is distinct from 'appeal_lodge' then return public.phase11_admin_command(p_operation,p_data);end if;
 perform pg_advisory_xact_lock(20261030);
 if private.platform_rank()<30 or jsonb_typeof(p_data)<>'object' or length(btrim(p_data->>'reason')) not between 5 and 500 or length(btrim(p_data->>'body')) not between 10 and 2000 or (p_data->>'user_id')::uuid=auth.uid() or not exists(select 1 from auth.users where id=(p_data->>'user_id')::uuid and email_confirmed_at is not null and deleted_at is null) then raise exception 'Not authorized' using errcode='42501';end if;
 insert into public.moderation_appeals(user_id,body) values((p_data->>'user_id')::uuid,p_data->>'body') returning id into rid;
 insert into private.admin_audit(actor_id,target_id,action,reason) values(auth.uid(),(p_data->>'user_id')::uuid,'appeal_lodge',p_data->>'reason');return jsonb_build_object('ok',true,'id',rid);end$$;
revoke all on function public.admin_command(text,jsonb),private.central_content_audit(),private.archived_membership_guard() from public,anon,authenticated;
grant execute on function public.admin_command(text,jsonb) to authenticated;
notify pgrst,'reload schema';

-- Import prior bounded operational history once, retaining original actor/time.
insert into private.admin_audit(actor_id,community_id,target_id,action,reason,created_at)
select h.actor_id,h.community_id,h.target_id,h.action,left(h.reason,500),h.created_at from (
 select actor_id,community_id,target_id,'community.'||action action,'Existing community control: '||left(action,100) reason,created_at from public.community_audit_log
 union all select a.actor_id,p.community_id,coalesce(a.comment_id,a.post_id),'legacy.'||a.action,'Reported social content review: '||left(a.action,100),a.created_at from private.social_audit a left join public.posts p on p.id=a.post_id
 union all select a.actor_id,c.community_id,a.message_id,'legacy.'||a.action,'Channel message moderation: '||coalesce(nullif(a.reason,''),left(a.action,100)),a.created_at from private.message_moderation a left join public.messages m on m.id=a.message_id left join public.channels c on c.id=m.channel_id
 union all select actor_id,community_id,resource_id,'legacy.'||action,'Faith/event moderation: '||coalesce(nullif(reason,''),left(action,100)),created_at from private.space_audit
) h where not exists(select 1 from private.admin_audit old where old.actor_id is not distinct from h.actor_id and old.community_id is not distinct from h.community_id and old.target_id is not distinct from h.target_id and old.action=h.action and old.created_at=h.created_at) order by h.created_at;

$migration$;
 INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES('202610300004','admin_history');
 ELSE RAISE NOTICE 'Migration 202610300004 already recorded; skipped.'; END IF;
END $install$;

DO $install$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='202610300005') THEN
 EXECUTE $migration$
-- Only media attached to a reported item is held; never whole libraries/histories.
create table private.case_media(id uuid primary key default gen_random_uuid(),case_id uuid not null references private.moderation_cases on delete cascade,bucket text not null check(bucket in ('message-files','social-media')),storage_path text not null,mime text not null,filename text not null,unique(case_id,bucket,storage_path));
create index case_media_hold on private.case_media(bucket,storage_path);
alter table private.case_media enable row level security;
revoke all on private.case_media from public,anon,authenticated;
create function private.capture_case_media() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.target_type='message' then
  perform 1 from public.message_attachments where message_id=new.target_id and removed_at is null order by id for update;
  insert into private.case_media(case_id,bucket,storage_path,mime,filename) select new.id,'message-files',storage_path,mime,filename from public.message_attachments where message_id=new.target_id and removed_at is null limit 4;
 elsif new.target_type='post' then
  perform 1 from public.post_media where post_id=new.target_id and removed_at is null order by id for update;
  insert into private.case_media(case_id,bucket,storage_path,mime,filename) select new.id,'social-media',storage_path,mime,filename from public.post_media where post_id=new.target_id and removed_at is null limit 4;
 end if;return new;end$$;
create trigger capture_case_media after insert on private.moderation_cases for each row execute function private.capture_case_media();
insert into private.case_media(case_id,bucket,storage_path,mime,filename)
 select c.id,'message-files',a.storage_path,a.mime,a.filename from private.moderation_cases c join public.message_attachments a on a.message_id=c.target_id where c.target_type='message' and c.retain_until>now() and a.removed_at is null
 union all select c.id,'social-media',m.storage_path,m.mime,m.filename from private.moderation_cases c join public.post_media m on m.post_id=c.target_id where c.target_type='post' and c.retain_until>now() and m.removed_at is null on conflict do nothing;
create function private.evidence_hold(b text,p text) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from private.case_media m join private.moderation_cases c on c.id=m.case_id where m.bucket=b and m.storage_path=p and c.retain_until>now())$$;
create function public.admin_evidence_file(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare m private.case_media;c private.moderation_cases;begin
 select * into m from private.case_media where id=p_id;select * into c from private.moderation_cases where id=m.case_id;
 if c.id is null or not private.case_access(c) or c.retain_until<=now() then raise exception 'Not authorized' using errcode='42501';end if;
 if not private.take_limit('evidence:'||auth.uid()::text,120,900) then raise exception 'Rate limited' using errcode='42501';end if;
 insert into private.admin_audit(actor_id,community_id,target_id,action,reason) values(auth.uid(),c.community_id,c.id,'evidence.file','Opened media attached to a reported item');
 return jsonb_build_object('bucket',m.bucket,'storage_path',m.storage_path,'mime',m.mime,'filename',m.filename);end$$;
-- Keep the versioned read/cleanup bodies inspectable below; no public file URLs.
create or replace function public.admin_read(p_view text default 'overview',p_community uuid default null,p_before bigint default null,p_search text default '') returns jsonb language plpgsql security definer set search_path='' as $$
declare pr integer:=private.platform_rank();cr integer:=private.admin_community_rank(p_community);result jsonb;begin
 if not private.is_verified_member() or length(p_search)>48 or (p_before is not null and p_before<1) then raise exception 'Not authorized' using errcode='42501';end if;
 if p_view='context' then return jsonb_build_object('rank',pr,'communities',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'rank',private.admin_community_rank(c.id),'archived',c.archived) order by c.name) from public.communities c where pr>=20 or private.admin_community_rank(c.id)>=20),'[]'),'retention_days',case when pr>=30 then (select evidence_days from private.admin_settings) else null end);end if;
 if pr<20 and cr<20 then raise exception 'Not authorized' using errcode='42501';end if;
 if not private.take_limit('admin-read:'||auth.uid()::text,300,900) then raise exception 'Rate limited' using errcode='42501';end if;
 if p_view='overview' then return jsonb_build_object('members',(select count(*) from public.profiles p where (p_community is null and pr>=20) or exists(select 1 from public.community_members m where m.user_id=p.id and m.community_id=p_community)),'communities',(select count(*) from public.communities where (p_community is null and pr>=20) or id=p_community),'messages_7d',(select count(*) from public.messages m join public.channels c on c.id=m.channel_id where m.created_at>now()-interval '7 days' and ((p_community is null and pr>=20) or c.community_id=p_community)),'open_reports',(select count(*) from private.moderation_cases c where c.status='open' and private.case_access(c) and (p_community is null or c.community_id=p_community)),'voice_admissions',(select count(*) from private.voice_sessions v join public.channels c on c.id=v.channel_id where v.expires_at>now() and ((p_community is null and pr>=20) or c.community_id=p_community)),'posts_7d',(select count(*) from public.posts where created_at>now()-interval '7 days' and ((p_community is null and pr>=20) or community_id=p_community)));end if;
 if p_view='members' then
 select coalesce(jsonb_agg(x order by x.username),'[]') into result from (select p.id,p.username,p.display_name,case when pr>=20 then case when u.banned_until>now() then 'restricted' else 'active' end else m.status end status,case when pr>=20 then r.role else null end platform_role,m.role_id community_role from public.profiles p join auth.users u on u.id=p.id left join private.platform_roles r on r.user_id=p.id left join public.community_members m on m.user_id=p.id and m.community_id=p_community where ((p_community is null and pr>=20) or m.community_id=p_community) and (p_search='' or left(lower(p.username),length(p_search))=lower(p_search)) order by p.username limit 50)x;return result;
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
-- Claim files before Storage deletion so an expired staged file cannot be attached
-- concurrently. Missing metadata after a deleted community is also cleaned up.
create or replace function public.chat_cleanup_files(p_user uuid default null,p_limit integer default 500)
returns table(id uuid,storage_path text)
language plpgsql security definer set search_path='' as $$
declare selected uuid[];
begin
 -- Match the channel lock order used by sends, edits, and account cleanup.
 perform 1 from public.channels where public.channels.id in (
  select a.channel_id from public.message_attachments a left join public.messages m on m.id=a.message_id
  where not private.evidence_hold('message-files',a.storage_path) and case when p_user is not null then a.author_id=p_user
  else (a.message_id is null and a.created_at<now()-interval '24 hours') or m.deleted_at is not null end
 ) order by public.channels.id for update;
 select array_agg(x.id) into selected from (
  select a.id from public.message_attachments a join storage.objects o on o.bucket_id='message-files' and o.name=a.storage_path
  left join public.messages m on m.id=a.message_id
  where not private.evidence_hold('message-files',a.storage_path) and case when p_user is not null then a.author_id=p_user
  else (a.message_id is null and a.created_at<now()-interval '24 hours') or m.deleted_at is not null end
  order by a.created_at,a.id limit least(greatest(p_limit,1),500) for update of a skip locked
 ) x;
 update public.message_attachments a set removed_at=coalesce(a.removed_at,now()) where a.id=any(selected);
 return query
 select a.id,a.storage_path from public.message_attachments a where a.id=any(selected)
 union all
 select o.id,o.name from storage.objects o where o.bucket_id='message-files'
 and not private.evidence_hold('message-files',o.name) and not exists(select 1 from public.message_attachments a where a.storage_path=o.name)
 and (case when p_user is not null then split_part(o.name,'/',2)=p_user::text else o.created_at<now()-interval '24 hours' end)
 limit least(greatest(p_limit,1),500);
end $$;
create or replace function public.social_cleanup_files(p_user uuid default null,p_limit integer default 500) returns table(id uuid,storage_path text) language plpgsql security definer set search_path='' as $$
declare selected uuid[];
begin
 select array_agg(x.id) into selected from (select m.id from public.post_media m join storage.objects o on o.bucket_id='social-media' and o.name=m.storage_path
 where not private.evidence_hold('social-media',m.storage_path) and (case when p_user is not null then m.author_id=p_user else m.removed_at is not null or (m.post_id is null and m.created_at<now()-interval '24 hours') end)
 order by m.created_at,m.id limit least(greatest(p_limit,1),500) for update of m skip locked)x;
 update public.post_media m set removed_at=coalesce(m.removed_at,now()) where m.id=any(selected);
 return query select m.id,m.storage_path from public.post_media m where m.id=any(selected)
 union all select o.id,o.name from storage.objects o where o.bucket_id='social-media' and not private.evidence_hold('social-media',o.name) and not exists(select 1 from public.post_media m where m.storage_path=o.name)
 and (case when p_user is not null then split_part(o.name,'/',1)=p_user::text else o.created_at<now()-interval '24 hours' end) limit least(greatest(p_limit,1),500);
end $$;
create or replace function public.moderation_cleanup() returns integer language plpgsql security definer set search_path='' as $$declare n integer;begin
 delete from private.case_media m using private.moderation_cases c where c.id=m.case_id and c.retain_until<=now();
 update private.moderation_cases set evidence=null,reason='Report details expired' where retain_until<=now() and (evidence is not null or reason<>'Report details expired');get diagnostics n=row_count;
 update public.moderation_appeals set body='Appeal details expired',decision=null where created_at<now()-interval '365 days' and status<>'pending';return n;end$$;
revoke all on function private.capture_case_media(),private.evidence_hold(text,text),public.admin_evidence_file(uuid) from public,anon,authenticated;
grant execute on function public.admin_evidence_file(uuid) to authenticated;
notify pgrst,'reload schema';

$migration$;
 INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES('202610300005','moderation_media');
 ELSE RAISE NOTICE 'Migration 202610300005 already recorded; skipped.'; END IF;
END $install$;
NOTIFY pgrst,'reload schema';
COMMIT;
