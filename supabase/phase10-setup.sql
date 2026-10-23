-- Phase 10: safe pending-only installation after Phase 9.
-- Copy the ENTIRE file into Supabase SQL Editor. Recorded versions are skipped.
BEGIN;
SELECT pg_advisory_xact_lock(20261029);
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations(version text PRIMARY KEY,statements text[],name text);
REVOKE ALL ON SCHEMA supabase_migrations FROM public,anon,authenticated;
REVOKE ALL ON supabase_migrations.schema_migrations FROM public,anon,authenticated;
DO $preflight$ BEGIN
 IF to_regprocedure('public.people_topic_allowed(text)') IS NULL THEN RAISE EXCEPTION 'Install Phase 9 first.'; END IF;
 IF (to_regclass('public.prayer_requests') IS NOT NULL OR to_regclass('public.events') IS NOT NULL OR to_regclass('public.notifications') IS NOT NULL) AND NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='202610290001') THEN
 RAISE EXCEPTION 'Phase 10 tables exist without a migration record. Stop and inspect migration history; no tables were changed.'; END IF;
END $preflight$;

DO $install$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='202610290001') THEN
 EXECUTE $migration$
-- Phase 10: community-only faith spaces, events and consent-based notification metadata.
create table public.prayer_requests (
 id uuid primary key, seq bigint generated always as identity unique,
 community_id uuid not null references public.communities on delete cascade,
 author_id uuid not null references auth.users on delete cascade,
 body text not null check(length(body)<=4000),
 visibility text not null check(visibility in ('community','moderators')),
 status text not null default 'open' check(status in ('open','answered','hidden','removed')),
 guidelines_accepted_at timestamptz not null default now(),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index prayer_page on public.prayer_requests(community_id,seq desc);
create table public.prayer_comments (
 id uuid primary key,seq bigint generated always as identity unique,
 prayer_id uuid not null references public.prayer_requests on delete cascade,
 author_id uuid not null references auth.users on delete cascade,
 body text not null check(length(btrim(body)) between 1 and 2000),
 created_at timestamptz not null default now()
);
create index prayer_comment_page on public.prayer_comments(prayer_id,seq);
create table public.prayer_encouragements (
 prayer_id uuid references public.prayer_requests on delete cascade,
 user_id uuid references auth.users on delete cascade,
 primary key(prayer_id,user_id)
);
create table public.events (
 id uuid primary key,seq bigint generated always as identity unique,
 community_id uuid not null references public.communities on delete cascade,
 host_id uuid not null references auth.users on delete cascade,
 title text not null check(length(btrim(title)) between 3 and 100),
 description text not null check(length(btrim(description)) between 1 and 5000),
 kind text not null check(kind in ('gaming','voice','discussion')),
 banner text not null check(banner in ('nebula','aurora','ember','ocean')),
 starts_at timestamptz not null,ends_at timestamptz not null,time_zone text not null,
 gaming_session_id uuid references public.gaming_sessions on delete set null,
 voice_channel_id uuid references public.channels on delete set null,
 status text not null default 'scheduled' check(status in ('scheduled','cancelled')),
 revision integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(ends_at>starts_at and ends_at<=starts_at+interval '7 days'),check(num_nonnulls(gaming_session_id,voice_channel_id)<=1)
);
create index events_page on public.events(community_id,seq desc);
create index events_reminder_window on public.events(starts_at) where status='scheduled';
create table public.event_rsvps (
 event_id uuid references public.events on delete cascade,user_id uuid references auth.users on delete cascade,
 response text not null check(response in ('going','interested','declined')),
 updated_at timestamptz not null default now(),primary key(event_id,user_id)
);
create index rsvps_user on public.event_rsvps(user_id,event_id);
create table public.notification_preferences (
 user_id uuid primary key references auth.users on delete cascade,
 friend_requests boolean not null default true,replies boolean not null default true,
 mentions boolean not null default false,community_invitations boolean not null default false,
 event_reminders boolean not null default false,event_updates boolean not null default true,
 gaming_invitations boolean not null default false,moderator_notices boolean not null default true,
 daily_content boolean not null default false
);
create table public.community_notification_invitations (
 id uuid primary key default gen_random_uuid(),community_id uuid not null references public.communities on delete cascade,
 sender_id uuid not null references auth.users on delete cascade,recipient_id uuid not null references auth.users on delete cascade,
 invitation_id uuid not null references public.invitations on delete cascade,
 status text not null default 'pending' check(status in ('pending','accepted','declined')),
 expires_at timestamptz not null default now()+interval '7 days',created_at timestamptz not null default now()
);
create unique index pending_community_delivery on public.community_notification_invitations(community_id,recipient_id) where status='pending';
create table private.community_delivery_tokens(invitation_id uuid primary key references public.invitations on delete cascade,token text not null);
create table public.gaming_session_invitations (
 id uuid primary key default gen_random_uuid(),session_id uuid not null references public.gaming_sessions on delete cascade,
 sender_id uuid not null references auth.users on delete cascade,recipient_id uuid not null references auth.users on delete cascade,
 status text not null default 'pending' check(status in ('pending','accepted','declined')),
 expires_at timestamptz not null default now()+interval '7 days',created_at timestamptz not null default now()
);
create unique index pending_gaming_invitation on public.gaming_session_invitations(session_id,recipient_id) where status='pending';
create table public.moderator_notices (
 id uuid primary key,community_id uuid not null references public.communities on delete cascade,
 sender_id uuid not null references auth.users on delete cascade,recipient_id uuid not null references auth.users on delete cascade,
 body text not null check(length(btrim(body)) between 1 and 2000),created_at timestamptz not null default now()
);
create table public.notifications (
 id bigint generated always as identity primary key,
 recipient_id uuid not null references auth.users on delete cascade,
 actor_id uuid references auth.users on delete cascade,
 kind text not null check(kind in ('friend_requests','replies','mentions','community_invitations','event_reminders','event_updates','gaming_invitations','moderator_notices')),
 resource_type text not null check(resource_type in ('friend','channel','post','prayer','event','community_invite','squad_invite','notice')),
 resource_id uuid not null,dedupe_key text not null unique,
 read_at timestamptz,created_at timestamptz not null default now()
);
create index notifications_owner_page on public.notifications(recipient_id,id desc);
create index notifications_actor on public.notifications(actor_id,recipient_id);
create table private.space_budgets(user_id uuid references auth.users on delete cascade,operation text not null,started_at timestamptz not null default now(),attempts integer not null default 0,primary key(user_id,operation));
create table private.space_audit(id bigint generated always as identity primary key,community_id uuid references public.communities on delete cascade,actor_id uuid references auth.users on delete set null,resource_id uuid,action text not null,reason text not null default '' check(length(reason)<=300),created_at timestamptz not null default now());
-- Future providers may consume this private schema only after explicit consent and operator configuration.
-- No email/push delivery is scheduled or claimed by this phase.
create table private.notification_delivery_outbox(id bigint generated always as identity primary key,notification_id bigint not null references public.notifications on delete cascade,transport text not null check(transport in ('email','push')),status text not null default 'disabled' check(status in ('disabled','pending','sent','failed')),attempts integer not null default 0,next_attempt_at timestamptz,unique(notification_id,transport));

create function private.space_rank(u uuid,c uuid) returns integer language sql stable security definer set search_path='' as $$
 select coalesce((select r.rank from public.community_members m join public.community_roles r on r.id=m.role_id where m.user_id=u and m.community_id=c and m.status='active' and private.squad_live(u)),0);
$$;
create function private.prayer_allowed(u uuid,p uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.prayer_requests q where q.id=p and private.space_rank(u,q.community_id)>0 and private.squad_live(q.author_id) and not private.squad_blocked(u,q.author_id)
 and (u=q.author_id or private.space_rank(u,q.community_id)>=20 or (q.visibility='community' and q.status in ('open','answered'))));
$$;
create function public.prayer_access(p_prayer uuid) returns boolean language sql stable security definer set search_path='' as $$select private.prayer_allowed(auth.uid(),p_prayer);$$;
create function private.event_allowed(u uuid,e uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.events where id=e and private.space_rank(u,community_id)>0 and private.squad_live(host_id) and not private.squad_blocked(u,host_id));
$$;
create function public.event_access(p_event uuid) returns boolean language sql stable security definer set search_path='' as $$select private.event_allowed(auth.uid(),p_event);$$;
create function private.channel_user_allowed(u uuid,cid uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
declare c public.channels;r integer;rid text;begin
 select * into c from public.channels where id=cid;if not found then return false;end if;r:=private.space_rank(u,c.community_id);if r=0 then return false;end if;if r>=30 then return true;end if;
 select role_id into rid from public.community_members where user_id=u and community_id=c.community_id;
 if exists(select 1 from public.channel_permission_overrides where channel_id=cid and (user_id=u or role_id=rid) and not can_view) then return false;end if;
 return not c.is_private or exists(select 1 from public.channel_permission_overrides where channel_id=cid and (user_id=u or role_id=rid) and can_view);
end $$;
create function private.post_user_allowed(u uuid,pid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.squad_live(u) and exists(select 1 from public.posts p where p.id=pid and p.status='published' and (p.author_id is null or not private.squad_blocked(u,p.author_id)) and
 case p.audience when 'members' then true when 'community' then private.space_rank(u,p.community_id)>0 when 'private' then u=p.author_id else u=p.author_id or exists(select 1 from public.follows where follower_id=u and followed_id=p.author_id) end);
$$;
create function private.notification_resource(u uuid,t text,r uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
declare inv public.community_notification_invitations;gi public.gaming_session_invitations;s public.gaming_sessions;begin
 if not private.squad_live(u) then return false;end if;
 case t
 when 'friend' then return not private.squad_blocked(u,r) and private.squad_live(r) and exists(select 1 from public.friendships where low_id=least(u,r) and high_id=greatest(u,r));
 when 'prayer' then return private.prayer_allowed(u,r);
 when 'event' then return private.event_allowed(u,r);
 when 'channel' then return exists(select 1 from public.messages where id=r and deleted_at is null and private.channel_user_allowed(u,channel_id) and (author_id is null or not private.squad_blocked(u,author_id)));
 when 'post' then return private.post_user_allowed(u,r);
 when 'community_invite' then
  select * into inv from public.community_notification_invitations where id=r;return found and u=inv.recipient_id and inv.status='pending' and inv.expires_at>now() and not private.squad_blocked(u,inv.sender_id) and private.space_rank(inv.sender_id,inv.community_id)>=20 and not exists(select 1 from public.community_members where community_id=inv.community_id and user_id=u and status='banned');
 when 'squad_invite' then
  select * into gi from public.gaming_session_invitations where id=r;select * into s from public.gaming_sessions where id=gi.session_id;
  return gi.id is not null and s.id is not null and u=gi.recipient_id and gi.status='pending' and gi.expires_at>now() and s.status='open' and s.expires_at>now() and private.squad_eligible(u,s) and not private.squad_blocked(u,gi.sender_id);
 when 'notice' then return exists(select 1 from public.moderator_notices where id=r and recipient_id=u and private.space_rank(u,community_id)>0 and not private.squad_blocked(u,sender_id));
 else return false;end case;
end $$;
create function public.notification_access(p_id bigint) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.notifications n join public.notification_preferences pref on pref.user_id=n.recipient_id where n.id=p_id and n.recipient_id=auth.uid() and (n.actor_id is null or not private.squad_blocked(auth.uid(),n.actor_id)) and coalesce((to_jsonb(pref)->>n.kind)::boolean,false) and private.notification_resource(auth.uid(),n.resource_type,n.resource_id)
 and (n.kind not in ('event_reminders','event_updates') or exists(select 1 from public.event_rsvps where event_id=n.resource_id and user_id=auth.uid() and response='going'))
 and (n.kind<>'event_reminders' or exists(select 1 from public.events e join public.user_preferences up on up.user_id=auth.uid() where e.id=n.resource_id and up.event_reminders and e.status='scheduled' and e.starts_at>now() and n.dedupe_key like 'reminder:'||e.id::text||':'||e.revision::text||':%')));
$$;
create function private.emit_notification(u uuid,a uuid,k text,t text,r uuid,d text) returns void language plpgsql security definer set search_path='' as $$
begin
 if u is null or u=a or not private.squad_live(u) or (a is not null and (not private.squad_live(a) or private.squad_blocked(u,a))) or not private.notification_resource(u,t,r) or not exists(select 1 from public.notification_preferences p where user_id=u and coalesce((to_jsonb(p)->>k)::boolean,false)) then return;end if;
 insert into public.notifications(recipient_id,actor_id,kind,resource_type,resource_id,dedupe_key) values(u,a,k,t,r,d) on conflict(dedupe_key) do nothing;
 if found then perform realtime.send('{}'::jsonb,'changed','people:'||u::text,true);end if;
end $$;
create function private.bootstrap_notifications() returns trigger language plpgsql security definer set search_path='' as $$begin insert into public.notification_preferences(user_id) values(new.id) on conflict do nothing;return new;end $$;
create trigger notification_preferences_bootstrap after insert on auth.users for each row execute function private.bootstrap_notifications();
insert into public.notification_preferences(user_id,event_reminders) select user_id,event_reminders from public.user_preferences on conflict do nothing;

-- Every new data/operational table has RLS, including tables with no browser grants.
do $$declare t text;begin
 foreach t in array array['prayer_requests','prayer_comments','prayer_encouragements','events','event_rsvps','notification_preferences','community_notification_invitations','gaming_session_invitations','moderator_notices','notifications'] loop
 execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);end loop;
 foreach t in array array['community_delivery_tokens','space_budgets','space_audit','notification_delivery_outbox'] loop execute format('alter table private.%I enable row level security',t);execute format('revoke all on private.%I from public,anon,authenticated',t);end loop;
end $$;
grant select on public.prayer_requests,public.prayer_comments,public.prayer_encouragements,public.events,public.event_rsvps,public.notification_preferences,public.notifications to authenticated;
create policy prayer_read on public.prayer_requests for select to authenticated using(public.prayer_access(id));
create policy prayer_comment_read on public.prayer_comments for select to authenticated using(public.prayer_access(prayer_id));
-- Individual encouragement identities are private to their author; totals are authorized projections.
create policy prayer_encouragement_read on public.prayer_encouragements for select to authenticated using(user_id=auth.uid() and public.prayer_access(prayer_id));
create policy events_read on public.events for select to authenticated using(public.event_access(id));
create policy rsvp_read on public.event_rsvps for select to authenticated using(user_id=auth.uid() and public.event_access(event_id));
create policy notification_preferences_read on public.notification_preferences for select to authenticated using(user_id=auth.uid() and private.is_verified_member());
create policy notifications_read on public.notifications for select to authenticated using(public.notification_access(id));
-- Only current-user boolean policy helpers are executable by clients.
revoke all on function private.space_rank(uuid,uuid),private.prayer_allowed(uuid,uuid),private.event_allowed(uuid,uuid),private.channel_user_allowed(uuid,uuid),private.post_user_allowed(uuid,uuid),private.notification_resource(uuid,text,uuid),private.emit_notification(uuid,uuid,text,text,uuid,text),private.bootstrap_notifications() from public,anon,authenticated;
revoke all on function public.prayer_access(uuid),public.event_access(uuid),public.notification_access(bigint) from public,anon;
grant execute on function public.prayer_access(uuid),public.event_access(uuid),public.notification_access(bigint) to authenticated;

$migration$;
 INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES('202610290001','spaces');
 ELSE RAISE NOTICE 'Migration 202610290001 already recorded; skipped.'; END IF;
END $install$;

DO $install$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='202610290002') THEN
 EXECUTE $migration$
create function public.space_budget(p_operation text) returns boolean language plpgsql security definer set search_path='' as $$
declare n integer;lim integer;begin
 if not private.squad_live(auth.uid()) or p_operation not in ('request','prayer','comment','event','invite','notice','control') then return false;end if;
 lim:=case p_operation when 'request' then 120 when 'prayer' then 5 when 'comment' then 20 when 'event' then 5 when 'invite' then 10 when 'notice' then 10 else 60 end;
 insert into private.space_budgets(user_id,operation,attempts) values(auth.uid(),p_operation,1) on conflict(user_id,operation) do update set attempts=case when private.space_budgets.started_at<clock_timestamp()-interval '1 minute' then 1 else private.space_budgets.attempts+1 end,started_at=case when private.space_budgets.started_at<clock_timestamp()-interval '1 minute' then clock_timestamp() else private.space_budgets.started_at end returning attempts into n;return n<=lim;
end $$;
create function private.space_text(t text,max_length integer) returns boolean language sql immutable set search_path='' as $$select t is not null and length(btrim(t)) between 1 and max_length and t !~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]';$$;
create function private.prayer_dto(p public.prayer_requests) returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(p)||jsonb_build_object('seq',p.seq::text,'author_name',(select display_name from public.profiles where id=p.author_id),'can_manage',auth.uid()=p.author_id or private.space_rank(auth.uid(),p.community_id)>=20,'moderator',private.space_rank(auth.uid(),p.community_id)>=20,'encouraged',exists(select 1 from public.prayer_encouragements where prayer_id=p.id and user_id=auth.uid()),'encouragements',(select count(*) from public.prayer_encouragements where prayer_id=p.id and not private.squad_blocked(auth.uid(),user_id)));
$$;
create function private.event_dto(e public.events) returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(e)||jsonb_build_object('seq',e.seq::text,'community_name',(select name from public.communities where id=e.community_id),'host_name',(select display_name from public.profiles where id=e.host_id),'can_manage',e.host_id=auth.uid() or private.space_rank(auth.uid(),e.community_id)>=20,
 'gaming_session_id',case when public.squad_access(e.gaming_session_id) then e.gaming_session_id else null end,'voice_channel_id',case when public.channel_access(e.voice_channel_id,'connect') then e.voice_channel_id else null end,
 'going',(select count(*) from public.event_rsvps where event_id=e.id and response='going' and private.space_rank(user_id,e.community_id)>0 and not private.squad_blocked(auth.uid(),user_id)),
 'my_rsvp',(select response from public.event_rsvps where event_id=e.id and user_id=auth.uid()),'state',case when e.status='cancelled' then 'cancelled' when e.ends_at<=now() then 'ended' when e.starts_at<=now() then 'live' else 'upcoming' end);
$$;
create function public.space_read(p_view text,p_resource uuid default null,p_community uuid default null,p_before bigint default null,p_filter text default 'all') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.prayer_requests;e public.events;result jsonb;begin
 if not private.squad_live(auth.uid()) then raise exception 'Not authorized' using errcode='42501';end if;
 if p_before is not null and p_before<1 then raise exception 'Invalid cursor' using errcode='22023';end if;
 if p_view='context' then return jsonb_build_object(
  'communities',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'rank',private.space_rank(auth.uid(),id)) order by name) from public.communities where private.space_rank(auth.uid(),id)>0),'[]'),
  'channels',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'community_id',community_id)) from public.channels where kind='voice' and public.channel_access(id,'connect')),'[]'),
  'sessions',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',title,'community_id',community_id)) from public.gaming_sessions where host_id=auth.uid() and status='open' and expires_at>now()),'[]'),
  'preferences',(select to_jsonb(v)-'user_id' from public.notification_preferences v where user_id=auth.uid()));
 elsif p_view='prayers' then
  if private.space_rank(auth.uid(),p_community)=0 then raise exception 'Community unavailable' using errcode='42501';end if;
  select coalesce(jsonb_agg(private.prayer_dto(q) order by q.seq desc),'[]') into result from(select * from public.prayer_requests where community_id=p_community and public.prayer_access(id) and (p_before is null or seq<p_before) order by seq desc limit 20)q;return jsonb_build_object('items',result);
 elsif p_view='prayer' then
  if not public.prayer_access(p_resource) then raise exception 'Request unavailable' using errcode='42501';end if;
  select * into p from public.prayer_requests where id=p_resource;
  return jsonb_build_object('prayer',private.prayer_dto(p),'comments',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('seq',c.seq::text,'author_name',(select display_name from public.profiles where id=c.author_id),'can_remove',c.author_id=auth.uid() or private.space_rank(auth.uid(),p.community_id)>=20) order by c.seq) from(select * from public.prayer_comments where prayer_id=p.id and not private.squad_blocked(auth.uid(),author_id) and (p_before is null or seq<p_before) order by seq desc limit 40)c),'[]'));
 elsif p_view='events' then
  if p_filter not in ('all','gaming','voice','discussion') then raise exception 'Invalid filter' using errcode='22023';end if;
  select coalesce(jsonb_agg(private.event_dto(q) order by q.seq desc),'[]') into result from(select * from public.events where public.event_access(id) and (p_community is null or community_id=p_community) and (p_filter='all' or kind=p_filter) and (p_before is null or seq<p_before) order by seq desc limit 20)q;return jsonb_build_object('items',result);
 elsif p_view='event' then
  if not public.event_access(p_resource) then raise exception 'Event unavailable' using errcode='42501';end if;select * into e from public.events where id=p_resource;return private.event_dto(e);
 elsif p_view='notifications' then
  select coalesce(jsonb_agg(jsonb_build_object('id',n.id::text,'kind',n.kind,'resource_type',n.resource_type,'resource_id',n.resource_id,'read',n.read_at is not null,'created_at',n.created_at,'href',case n.resource_type when 'friend' then '/messages?tab=friends' when 'prayer' then '/faith/'||n.resource_id::text when 'event' then '/events/'||n.resource_id::text when 'post' then '/feed/'||n.resource_id::text when 'channel' then (select '/channels/'||channel_id::text||'?message='||n.resource_id::text from public.messages where id=n.resource_id) else '/notifications' end) order by n.id desc),'[]') into result from(select * from public.notifications where recipient_id=auth.uid() and public.notification_access(id) and (p_before is null or id<p_before) order by id desc limit 30)n;return jsonb_build_object('items',result,'unread',(select count(*) from public.notifications where recipient_id=auth.uid() and read_at is null and public.notification_access(id)),'preferences',(select to_jsonb(v)-'user_id' from public.notification_preferences v where user_id=auth.uid()));
 elsif p_view='notice' then
  if not private.notification_resource(auth.uid(),'notice',p_resource) then raise exception 'Notice unavailable' using errcode='42501';end if;return (select jsonb_build_object('id',id,'body',body,'created_at',created_at) from public.moderator_notices where id=p_resource);
 else raise exception 'Invalid view' using errcode='22023';end if;
end $$;

create function public.space_command(p_operation text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();target uuid;cid uuid;item uuid;p public.prayer_requests;e public.events;g public.gaming_sessions;ci public.community_notification_invitations;gi public.gaming_session_invitations;t text;kind_value text;starts timestamptz;ends timestamptz;tz text;old_revision integer;pref jsonb;field text;member_row record;begin
 if not private.squad_live(actor) then raise exception 'Not authorized' using errcode='42501';end if;
 if not public.space_budget(case when p_operation='prayer-create' then 'prayer' when p_operation='prayer-comment' then 'comment' when p_operation='event-create' then 'event' when p_operation in ('invite-community','invite-squad') then 'invite' when p_operation='notice-create' then 'notice' else 'control' end) then return jsonb_build_object('limited',true);end if;
 if p_operation='preferences' then
  foreach field in array array['friend_requests','replies','mentions','community_invitations','event_reminders','event_updates','gaming_invitations','moderator_notices','daily_content'] loop if jsonb_typeof(p_data->field) is distinct from 'boolean' then raise exception 'Invalid preferences' using errcode='22023';end if;end loop;
  update public.notification_preferences set friend_requests=(p_data->>'friend_requests')::boolean,replies=(p_data->>'replies')::boolean,mentions=(p_data->>'mentions')::boolean,community_invitations=(p_data->>'community_invitations')::boolean,event_reminders=(p_data->>'event_reminders')::boolean,event_updates=(p_data->>'event_updates')::boolean,gaming_invitations=(p_data->>'gaming_invitations')::boolean,moderator_notices=(p_data->>'moderator_notices')::boolean,daily_content=(p_data->>'daily_content')::boolean where user_id=actor;
  update public.user_preferences set event_reminders=(p_data->>'event_reminders')::boolean where user_id=actor;
  return jsonb_build_object('ok',true);
 elsif p_operation='notifications-read' then
  update public.notifications set read_at=now() where recipient_id=actor and read_at is null and (p_data->>'id' is null or id=(p_data->>'id')::bigint);
  if p_data->>'id' is null then update public.member_notifications set read_at=now() where user_id=actor and read_at is null;end if;return jsonb_build_object('ok',true);
 elsif p_operation in ('accept-community','decline-community') then
  select * into ci from public.community_notification_invitations where id=(p_data->>'id')::uuid and recipient_id=actor;
  if not found or not private.notification_resource(actor,'community_invite',ci.id) then raise exception 'Invitation unavailable' using errcode='42501';end if;
  -- Original community command owns lock ordering, live roles, membership, bans and block enforcement.
  if p_operation='accept-community' then select token into t from private.community_delivery_tokens where invitation_id=ci.invitation_id;perform public.community_command('accept_invite',ci.community_id,jsonb_build_object('token',t));end if;
  update public.community_notification_invitations set status=case when p_operation='accept-community' then 'accepted' else 'declined' end where id=ci.id;
  return jsonb_build_object('href','/communities/'||(select slug from public.communities where id=ci.community_id));
 elsif p_operation in ('accept-squad','decline-squad') then
  select * into gi from public.gaming_session_invitations where id=(p_data->>'id')::uuid and recipient_id=actor;
  if not found or not private.notification_resource(actor,'squad_invite',gi.id) then raise exception 'Invitation unavailable' using errcode='42501';end if;
  update public.gaming_session_invitations set status=case when p_operation='accept-squad' then 'accepted' else 'declined' end where id=gi.id;
  return jsonb_build_object('href','/squad-up/'||gi.session_id::text);
 elsif p_operation in ('invite-community','invite-squad','notice-create') then
  cid:=(p_data->>'community')::uuid;target:=(p_data->>'target')::uuid;
  if p_operation='invite-squad' then select * into g from public.gaming_sessions where id=(p_data->>'session')::uuid;cid:=g.community_id;if g.host_id is distinct from actor or g.status<>'open' or g.expires_at<=now() or not private.squad_eligible(target,g) then raise exception 'Invitation unavailable' using errcode='42501';end if;
  else
   perform 1 from public.communities where id=cid for update;
   if private.space_rank(actor,cid)<20 then raise exception 'Not authorized' using errcode='42501';end if;
  end if;
  perform private.people_pair(actor,target);
  if actor=target or not private.squad_live(target) or private.squad_blocked(actor,target) then raise exception 'Member unavailable' using errcode='42501';end if;
  kind_value:=case p_operation when 'invite-community' then 'community_invitations' when 'invite-squad' then 'gaming_invitations' else 'moderator_notices' end;
  if not exists(select 1 from public.notification_preferences where user_id=target and (to_jsonb(notification_preferences)->>kind_value)::boolean) then raise exception 'Contact unavailable' using errcode='42501';end if;
  if p_operation='notice-create' then
   if private.space_rank(target,cid)=0 or not private.space_text(p_data->>'body',2000) then raise exception 'Notice unavailable' using errcode='42501';end if;
   item:=(p_data->>'id')::uuid;insert into public.moderator_notices(id,community_id,sender_id,recipient_id,body) values(item,cid,actor,target,p_data->>'body') on conflict do nothing;
   if not exists(select 1 from public.moderator_notices where id=item and sender_id=actor and recipient_id=target) then raise exception 'Notice unavailable' using errcode='42501';end if;
   perform private.emit_notification(target,actor,kind_value,'notice',item,'notice:'||item::text);
  else
   if not private.people_friends(actor,target) then raise exception 'Invitation unavailable' using errcode='42501';end if;
   if p_operation='invite-community' then
    if exists(select 1 from public.community_members where community_id=cid and user_id=target) then raise exception 'Invitation unavailable' using errcode='42501';end if;
    delete from public.community_notification_invitations where community_id=cid and recipient_id=target and status='pending' and expires_at<=now();
    select id into item from public.community_notification_invitations where community_id=cid and recipient_id=target and status='pending';
    if item is null then
     t:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
     insert into public.invitations(community_id,invited_by,token_digest,expires_at) values(cid,actor,encode(sha256(convert_to(t,'UTF8')),'hex'),now()+interval '7 days') returning id into item;
     insert into private.community_delivery_tokens(invitation_id,token) values(item,t);
     insert into public.community_notification_invitations(community_id,sender_id,recipient_id,invitation_id) values(cid,actor,target,item) returning id into item;
    end if;
    perform private.emit_notification(target,actor,kind_value,'community_invite',item,'community-invite:'||item::text);
   else
    delete from public.gaming_session_invitations where session_id=g.id and recipient_id=target and status='pending' and expires_at<=now();
    insert into public.gaming_session_invitations(session_id,sender_id,recipient_id) values(g.id,actor,target) on conflict(session_id,recipient_id) where status='pending' do update set sender_id=excluded.sender_id returning id into item;
    perform private.emit_notification(target,actor,kind_value,'squad_invite',item,'squad-invite:'||item::text);
   end if;
  end if;
  return jsonb_build_object('ok',true);
 elsif p_operation='prayer-create' then
  cid:=(p_data->>'community')::uuid;item:=(p_data->>'id')::uuid;
  if private.space_rank(actor,cid)=0 then raise exception 'Not authorized' using errcode='42501';end if;
  if p_data->>'guidelines' is distinct from 'true' or not private.space_text(p_data->>'body',4000) or coalesce(p_data->>'visibility','') not in ('community','moderators') then raise exception 'Invalid request' using errcode='22023';end if;
  insert into public.prayer_requests(id,community_id,author_id,body,visibility) values(item,cid,actor,p_data->>'body',p_data->>'visibility') on conflict do nothing;
  if not exists(select 1 from public.prayer_requests where id=item and author_id=actor and community_id=cid) then raise exception 'Invalid request' using errcode='42501';end if;return jsonb_build_object('id',item);
 elsif p_operation like 'prayer-%' then
  select * into p from public.prayer_requests where id=(p_data->>'prayer')::uuid for update;
  if not found or not public.prayer_access(p.id) then raise exception 'Request unavailable' using errcode='42501';end if;
  if p_operation='prayer-comment' then
   if p.status not in ('open','answered') or not private.space_text(p_data->>'body',2000) then raise exception 'Invalid encouragement' using errcode='22023';end if;
   item:=(p_data->>'id')::uuid;insert into public.prayer_comments(id,prayer_id,author_id,body) values(item,p.id,actor,p_data->>'body') on conflict do nothing;
   if not exists(select 1 from public.prayer_comments where id=item and author_id=actor and prayer_id=p.id) then raise exception 'Invalid encouragement' using errcode='42501';end if;
  elsif p_operation='prayer-encourage' then
   if p.status not in ('open','answered') then raise exception 'Request unavailable' using errcode='42501';end if;
   if (p_data->>'enabled')::boolean then insert into public.prayer_encouragements values(p.id,actor) on conflict do nothing;else delete from public.prayer_encouragements where prayer_id=p.id and user_id=actor;end if;
  elsif p_operation='prayer-comment-remove' then
   delete from public.prayer_comments where id=(p_data->>'comment')::uuid and prayer_id=p.id and (author_id=actor or private.space_rank(actor,p.community_id)>=20);
   if not found then raise exception 'Not authorized' using errcode='42501';end if;
  else
   if p.author_id<>actor and private.space_rank(actor,p.community_id)<20 then raise exception 'Not authorized' using errcode='42501';end if;
   if p_operation='prayer-edit' then
    if actor<>p.author_id or p.status in ('hidden','removed') or not private.space_text(p_data->>'body',4000) or coalesce(p_data->>'visibility','') not in ('community','moderators') then raise exception 'Not authorized' using errcode='42501';end if;
    update public.prayer_requests set body=p_data->>'body',visibility=p_data->>'visibility',updated_at=now() where id=p.id;
   elsif p_operation='prayer-status' then
    t:=p_data->>'status';
    if t not in ('open','answered','hidden','removed') or (t='hidden' and private.space_rank(actor,p.community_id)<20) or (p.status='hidden' and private.space_rank(actor,p.community_id)<20) or (p.status='removed' and t<>'removed') then raise exception 'Not authorized' using errcode='42501';end if;
    if actor<>p.author_id and not private.space_text(p_data->>'reason',300) then raise exception 'Reason required' using errcode='22023';end if;
    update public.prayer_requests set status=t,body=case when t='removed' then '' else body end,updated_at=now() where id=p.id;
    if t='removed' then delete from public.prayer_comments where prayer_id=p.id;end if;
    insert into private.space_audit(community_id,actor_id,resource_id,action,reason) values(p.community_id,actor,p.id,'prayer-'||t,coalesce(p_data->>'reason',''));
   else raise exception 'Invalid operation' using errcode='22023';end if;
  end if;return jsonb_build_object('ok',true);
 elsif p_operation in ('event-create','event-update','event-cancel','rsvp') then
  item:=(p_data->>'id')::uuid;
  if p_operation='event-create' then cid:=(p_data->>'community')::uuid;if private.space_rank(actor,cid)=0 then raise exception 'Not authorized' using errcode='42501';end if;
  else select * into e from public.events where id=item for update;if not found or not public.event_access(e.id) then raise exception 'Event unavailable' using errcode='42501';end if;cid:=e.community_id;end if;
  if p_operation='rsvp' then
   if e.status<>'scheduled' or e.ends_at<=clock_timestamp() then raise exception 'Event has ended' using errcode='55000';end if;
   if coalesce(p_data->>'response','') not in ('going','interested','declined','withdraw') then raise exception 'Invalid RSVP' using errcode='22023';end if;
   if p_data->>'response'='withdraw' then delete from public.event_rsvps where event_id=item and user_id=actor;
   else insert into public.event_rsvps(event_id,user_id,response) values(item,actor,p_data->>'response') on conflict(event_id,user_id) do update set response=excluded.response,updated_at=now();end if;return jsonb_build_object('ok',true);
  end if;
  if p_operation<>'event-create' and e.host_id<>actor and private.space_rank(actor,cid)<20 then raise exception 'Not authorized' using errcode='42501';end if;
  if p_operation='event-cancel' then if e.status='cancelled' then return jsonb_build_object('ok',true);end if;update public.events set status='cancelled',revision=revision+1,updated_at=now() where id=item;
  else
   if p_operation='event-update' and (e.status<>'scheduled' or e.ends_at<=now()) then raise exception 'Event has ended' using errcode='55000';end if;
   tz:=p_data->>'time_zone';if not exists(select 1 from pg_catalog.pg_timezone_names where name=tz) then raise exception 'Invalid time zone' using errcode='22023';end if;
   starts:=(p_data->>'starts_local')::timestamp at time zone tz;ends:=(p_data->>'ends_local')::timestamp at time zone tz;
   if starts is null or ends is null or (starts at time zone tz)<>(p_data->>'starts_local')::timestamp or (ends at time zone tz)<>(p_data->>'ends_local')::timestamp or starts<now()-interval '5 minutes' or starts>now()+interval '366 days' or ends<=starts or ends>starts+interval '7 days' or not private.space_text(p_data->>'title',100) or length(btrim(p_data->>'title'))<3 or not private.space_text(p_data->>'description',5000) or coalesce(p_data->>'kind','') not in ('gaming','voice','discussion') or coalesce(p_data->>'banner','') not in ('nebula','aurora','ember','ocean') then raise exception 'Invalid event details' using errcode='22023';end if;
   if p_data->>'session' is not null then select * into g from public.gaming_sessions where id=(p_data->>'session')::uuid;if not found or not public.squad_access(g.id) or g.host_id<>actor or (g.community_id is not null and g.community_id<>cid) then raise exception 'Linked session unavailable' using errcode='42501';end if;end if;
   if p_data->>'voice' is not null and not exists(select 1 from public.channels where id=(p_data->>'voice')::uuid and community_id=cid and kind='voice' and public.channel_access(id,'connect')) then raise exception 'Linked voice room unavailable' using errcode='42501';end if;
   if p_operation='event-create' then
    insert into public.events(id,community_id,host_id,title,description,kind,banner,starts_at,ends_at,time_zone,gaming_session_id,voice_channel_id) values(item,cid,actor,p_data->>'title',p_data->>'description',p_data->>'kind',p_data->>'banner',starts,ends,tz,(p_data->>'session')::uuid,(p_data->>'voice')::uuid) on conflict do nothing;
    if not exists(select 1 from public.events where id=item and host_id=actor and community_id=cid) then raise exception 'Event unavailable' using errcode='42501';end if;
   else update public.events set title=p_data->>'title',description=p_data->>'description',kind=p_data->>'kind',banner=p_data->>'banner',starts_at=starts,ends_at=ends,time_zone=tz,gaming_session_id=(p_data->>'session')::uuid,voice_channel_id=(p_data->>'voice')::uuid,revision=revision+1,updated_at=now() where id=item;end if;
  end if;
  if p_operation<>'event-create' then
   select revision into old_revision from public.events where id=item;
   insert into private.space_audit(community_id,actor_id,resource_id,action) values(cid,actor,item,p_operation);
   for member_row in select user_id from public.event_rsvps where event_id=item and response='going' limit 5000 loop perform private.emit_notification(member_row.user_id,actor,'event_updates','event',item,'event-update:'||item::text||':'||old_revision::text||':'||member_row.user_id::text);end loop;
  end if;
  return jsonb_build_object('id',item);
 else raise exception 'Invalid operation' using errcode='22023';end if;
end $$;
revoke all on function private.space_text(text,integer),private.prayer_dto(public.prayer_requests),private.event_dto(public.events) from public,anon,authenticated;
revoke all on function public.space_budget(text),public.space_read(text,uuid,uuid,bigint,text),public.space_command(text,jsonb) from public,anon;
grant execute on function public.space_budget(text),public.space_read(text,uuid,uuid,bigint,text),public.space_command(text,jsonb) to authenticated;

$migration$;
 INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES('202610290002','space_operations');
 ELSE RAISE NOTICE 'Migration 202610290002 already recorded; skipped.'; END IF;
END $install$;

DO $install$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='202610290003') THEN
 EXECUTE $migration$
create function private.space_mentions(a uuid,body text,t text,r uuid,seed text) returns void language plpgsql security definer set search_path='' as $$
declare person record;begin
 for person in select distinct p.id from regexp_matches(lower(body),'(?:^|\s)@([a-z][a-z0-9_]{2,23})\M','g') m join public.profiles p on p.username=m[1] limit 5 loop
  perform private.emit_notification(person.id,a,'mentions',t,r,'mention:'||seed||':'||person.id::text);
 end loop;
end $$;
create function private.space_reply_notification() returns trigger language plpgsql security definer set search_path='' as $$
declare recipient uuid;resource uuid;rtype text;begin
 if tg_table_name='messages' then
  select author_id into recipient from public.messages where id=coalesce(new.reply_to_id,new.parent_id) and deleted_at is null;resource:=new.id;rtype:='channel';
 elsif tg_table_name='post_comments' then select author_id into recipient from public.posts where id=new.post_id;resource:=new.post_id;rtype:='post';
 elsif tg_table_name='prayer_comments' then select author_id into recipient from public.prayer_requests where id=new.prayer_id;resource:=new.prayer_id;rtype:='prayer';
 else resource:=new.id;rtype:='post';end if;
 perform private.emit_notification(recipient,new.author_id,'replies',rtype,resource,'reply:'||tg_table_name||':'||new.id::text);
 perform private.space_mentions(new.author_id,new.body,rtype,resource,tg_table_name||':'||new.id::text);
 return new;
end $$;
create trigger channel_reply_notifications after insert on public.messages for each row execute function private.space_reply_notification();
create trigger post_reply_notifications after insert on public.post_comments for each row execute function private.space_reply_notification();
create trigger post_mention_notifications after insert on public.posts for each row execute function private.space_reply_notification();
create trigger prayer_reply_notifications after insert on public.prayer_comments for each row execute function private.space_reply_notification();
create function private.friend_notification_bridge() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.notification_preferences where user_id=new.user_id and friend_requests) then return null;end if;
 perform private.emit_notification(new.user_id,new.actor_id,'friend_requests','friend',new.actor_id,'friend:'||new.id::text);return new;
end $$;
create trigger friend_notification_bridge before insert on public.member_notifications for each row execute function private.friend_notification_bridge();
create function private.friend_notification_read_sync() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.read_at is not null then update public.notifications set read_at=new.read_at where recipient_id=new.user_id and dedupe_key='friend:'||new.id::text;end if;return new;
end $$;
create trigger friend_notification_read_sync after update of read_at on public.member_notifications for each row execute function private.friend_notification_read_sync();
do $$declare n record;begin
 for n in select * from public.member_notifications loop
 perform private.emit_notification(n.user_id,n.actor_id,'friend_requests','friend',n.actor_id,'friend:'||n.id::text);
 if n.read_at is not null then update public.notifications set read_at=n.read_at where dedupe_key='friend:'||n.id::text;end if;
 end loop;
end $$;
-- Preserve the Phase 9 projection and old APIs while adding one unified bell count.
alter function public.people_home() rename to legacy_people_home;
revoke all on function public.legacy_people_home() from public,anon,authenticated;
create function public.people_home() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;begin
 result:=public.legacy_people_home();
 if not exists(select 1 from public.notification_preferences where user_id=auth.uid() and friend_requests) then result:=result||jsonb_build_object('notifications','[]'::jsonb,'notification_unread',0);end if;
 return result||jsonb_build_object('all_notification_unread',(select count(*) from public.notifications where recipient_id=auth.uid() and read_at is null and public.notification_access(id)));
end $$;
revoke all on function public.people_home() from public,anon;grant execute on function public.people_home() to authenticated;
create function public.deliver_event_reminders(p_limit integer default 500) returns jsonb language plpgsql security definer set search_path='' as $$
declare r record;d text;scanned integer:=0;delivered integer:=0;existed boolean;begin
 if p_limit is null or p_limit not between 1 and 5000 then raise exception 'Invalid limit' using errcode='22023';end if;
 perform pg_advisory_xact_lock(20261029);
 for r in select e.id,e.host_id,e.revision,v.user_id from public.events e join public.event_rsvps v on v.event_id=e.id and v.response='going' join public.notification_preferences n on n.user_id=v.user_id and n.event_reminders join public.user_preferences p on p.user_id=v.user_id and p.event_reminders
 where e.status='scheduled' and e.starts_at>clock_timestamp() and e.starts_at<=clock_timestamp()+interval '1 hour' and private.event_allowed(v.user_id,e.id)
 and not exists(select 1 from public.notifications where dedupe_key='reminder:'||e.id::text||':'||e.revision::text||':'||v.user_id::text)
 order by e.starts_at,e.id,v.user_id limit p_limit loop
  scanned:=scanned+1;d:='reminder:'||r.id::text||':'||r.revision::text||':'||r.user_id::text;
  perform private.emit_notification(r.user_id,r.host_id,'event_reminders','event',r.id,d);
  if exists(select 1 from public.notifications where dedupe_key=d) then delivered:=delivered+1;end if;
 end loop;
 return jsonb_build_object('scanned',scanned,'delivered',delivered);
end $$;
revoke all on function public.deliver_event_reminders(integer) from public,anon,authenticated;
grant execute on function public.deliver_event_reminders(integer) to service_role;
-- Prevent raw linked-resource metadata leaking through an otherwise accessible event.
revoke select on public.events from authenticated;
grant select(id,seq,community_id,host_id,title,description,kind,banner,starts_at,ends_at,time_zone,status,revision,created_at,updated_at) on public.events to authenticated;
create function public.prayer_comment_access(p_comment uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.prayer_comments where id=p_comment and public.prayer_access(prayer_id) and not private.squad_blocked(auth.uid(),author_id));
$$;
revoke all on function public.prayer_comment_access(uuid) from public,anon;grant execute on function public.prayer_comment_access(uuid) to authenticated;
alter policy prayer_comment_read on public.prayer_comments using(public.prayer_comment_access(id));
revoke all on function private.space_mentions(uuid,text,text,uuid,text),private.space_reply_notification(),private.friend_notification_bridge(),private.friend_notification_read_sync() from public,anon,authenticated;
notify pgrst,'reload schema';

$migration$;
 INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES('202610290003','space_notifications');
 ELSE RAISE NOTICE 'Migration 202610290003 already recorded; skipped.'; END IF;
END $install$;

DO $install$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='202610290004') THEN
 EXECUTE $migration$
-- Phase 10 permission hardening and scoped moderator recipient projection.
create or replace function public.space_read(p_view text,p_resource uuid default null,p_community uuid default null,p_before bigint default null,p_filter text default 'all') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.prayer_requests;e public.events;result jsonb;begin
 if not private.squad_live(auth.uid()) then raise exception 'Not authorized' using errcode='42501';end if;
 if p_before is not null and p_before<1 then raise exception 'Invalid cursor' using errcode='22023';end if;
 if p_view='context' then return jsonb_build_object(
  'communities',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'rank',private.space_rank(auth.uid(),id)) order by name) from public.communities where private.space_rank(auth.uid(),id)>0),'[]'),
  'channels',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'community_id',community_id)) from public.channels where kind='voice' and public.channel_access(id,'connect')),'[]'),
  'sessions',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',title,'community_id',community_id)) from public.gaming_sessions where host_id=auth.uid() and status='open' and expires_at>now()),'[]'),
  'preferences',(select to_jsonb(v)-'user_id' from public.notification_preferences v where user_id=auth.uid()));
 elsif p_view='prayers' then
  if private.space_rank(auth.uid(),p_community)=0 then raise exception 'Community unavailable' using errcode='42501';end if;
  select coalesce(jsonb_agg(private.prayer_dto(q) order by q.seq desc),'[]') into result from(select * from public.prayer_requests where community_id=p_community and public.prayer_access(id) and (p_before is null or seq<p_before) order by seq desc limit 20)q;return jsonb_build_object('items',result);
 elsif p_view='prayer' then
  if not public.prayer_access(p_resource) then raise exception 'Request unavailable' using errcode='42501';end if;
  select * into p from public.prayer_requests where id=p_resource;
  return jsonb_build_object('prayer',private.prayer_dto(p),'comments',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('seq',c.seq::text,'author_name',(select display_name from public.profiles where id=c.author_id),'can_remove',c.author_id=auth.uid() or private.space_rank(auth.uid(),p.community_id)>=20) order by c.seq) from(select * from public.prayer_comments where prayer_id=p.id and not private.squad_blocked(auth.uid(),author_id) and (p_before is null or seq<p_before) order by seq desc limit 40)c),'[]'));
 elsif p_view='events' then
  if p_filter not in ('all','gaming','voice','discussion') then raise exception 'Invalid filter' using errcode='22023';end if;
  select coalesce(jsonb_agg(private.event_dto(q) order by q.seq desc),'[]') into result from(select * from public.events where public.event_access(id) and (p_community is null or community_id=p_community) and (p_filter='all' or kind=p_filter) and (p_before is null or seq<p_before) order by seq desc limit 20)q;return jsonb_build_object('items',result);
 elsif p_view='event' then
  if not public.event_access(p_resource) then raise exception 'Event unavailable' using errcode='42501';end if;select * into e from public.events where id=p_resource;return private.event_dto(e);
 elsif p_view='notifications' then
  select coalesce(jsonb_agg(jsonb_build_object('id',n.id::text,'kind',n.kind,'resource_type',n.resource_type,'resource_id',n.resource_id,'read',n.read_at is not null,'created_at',n.created_at,'href',case n.resource_type when 'friend' then '/messages?tab=friends' when 'prayer' then '/faith/'||n.resource_id::text when 'event' then '/events/'||n.resource_id::text when 'post' then '/feed/'||n.resource_id::text when 'channel' then (select '/channels/'||channel_id::text||'?message='||n.resource_id::text from public.messages where id=n.resource_id) else '/notifications' end) order by n.id desc),'[]') into result from(select * from public.notifications where recipient_id=auth.uid() and public.notification_access(id) and (p_before is null or id<p_before) order by id desc limit 30)n;return jsonb_build_object('items',result,'unread',(select count(*) from public.notifications where recipient_id=auth.uid() and read_at is null and public.notification_access(id)),'preferences',(select to_jsonb(v)-'user_id' from public.notification_preferences v where user_id=auth.uid()));
 elsif p_view='recipients' then
  if private.space_rank(auth.uid(),p_community)<20 then raise exception 'Not authorized' using errcode='42501';end if;
  return jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'name',q.display_name)) from(select prof.id,prof.display_name from public.profiles prof join public.community_members m on m.user_id=prof.id where m.community_id=p_community and m.status='active' and prof.id<>auth.uid() and private.squad_live(prof.id) and not private.squad_blocked(auth.uid(),prof.id) order by prof.display_name,prof.id limit 1000)q),'[]'));
 elsif p_view='notice' then
  if not private.notification_resource(auth.uid(),'notice',p_resource) then raise exception 'Notice unavailable' using errcode='42501';end if;return (select jsonb_build_object('id',id,'body',body,'created_at',created_at) from public.moderator_notices where id=p_resource);
 else raise exception 'Invalid view' using errcode='22023';end if;
end $$;

create function private.targeted_invitation_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.accepted_by is not null and old.accepted_by is null and exists(select 1 from public.community_notification_invitations where invitation_id=new.id and (recipient_id<>new.accepted_by or status<>'pending')) then raise exception 'Invitation unavailable' using errcode='42501';end if;return new;end $$;
create trigger targeted_invitation_guard before update on public.invitations for each row execute function private.targeted_invitation_guard();
create function private.spaces_on_block() returns trigger language plpgsql security definer set search_path='' as $$begin
 update public.community_notification_invitations set status='declined' where status='pending' and ((sender_id=new.blocker_id and recipient_id=new.blocked_id) or (sender_id=new.blocked_id and recipient_id=new.blocker_id));
 update public.gaming_session_invitations set status='declined' where status='pending' and ((sender_id=new.blocker_id and recipient_id=new.blocked_id) or (sender_id=new.blocked_id and recipient_id=new.blocker_id));return new;end $$;
create trigger spaces_on_block after insert on public.member_blocks for each row execute function private.spaces_on_block();
revoke all on function private.targeted_invitation_guard(),private.spaces_on_block() from public,anon,authenticated;
create or replace function public.deliver_event_reminders(p_limit integer default 500) returns jsonb language plpgsql security definer set search_path='' as $$
declare r record;d text;scanned integer:=0;delivered integer:=0;existed boolean;begin
 if p_limit is null or p_limit not between 1 and 5000 then raise exception 'Invalid limit' using errcode='22023';end if;
 perform pg_advisory_xact_lock(20261029);
 for r in select e.id,e.host_id,e.revision,v.user_id from public.events e join public.event_rsvps v on v.event_id=e.id and v.response='going' join public.notification_preferences n on n.user_id=v.user_id and n.event_reminders join public.user_preferences p on p.user_id=v.user_id and p.event_reminders
 where e.status='scheduled' and e.starts_at>clock_timestamp() and e.starts_at<=clock_timestamp()+interval '1 hour' and private.event_allowed(v.user_id,e.id)
 and not exists(select 1 from public.notifications where dedupe_key='reminder:'||e.id::text||':'||e.revision::text||':'||v.user_id::text)
 order by e.starts_at,e.id,v.user_id limit p_limit loop
  scanned:=scanned+1;d:='reminder:'||r.id::text||':'||r.revision::text||':'||r.user_id::text;
  perform private.emit_notification(r.user_id,null,'event_reminders','event',r.id,d);
  if exists(select 1 from public.notifications where dedupe_key=d) then delivered:=delivered+1;end if;
 end loop;
 return jsonb_build_object('scanned',scanned,'delivered',delivered);
end $$;

create function private.sync_event_reminder_preference() returns trigger language plpgsql security definer set search_path='' as $$begin
 update public.notification_preferences set event_reminders=new.event_reminders where user_id=new.user_id and event_reminders is distinct from new.event_reminders;return new;end $$;
create trigger sync_event_reminder_preference after update of event_reminders on public.user_preferences for each row execute function private.sync_event_reminder_preference();
revoke all on function private.sync_event_reminder_preference() from public,anon,authenticated;
notify pgrst,'reload schema';

$migration$;
 INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES('202610290004','space_guards');
 ELSE RAISE NOTICE 'Migration 202610290004 already recorded; skipped.'; END IF;
END $install$;
NOTIFY pgrst,'reload schema';
COMMIT;
