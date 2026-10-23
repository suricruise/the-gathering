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
