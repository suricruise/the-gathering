-- Phase 9 safe installer. Copy the ENTIRE file. Recorded migrations are skipped.
-- Existing unrecorded Phase 9 tables require inspection, never destructive repair.
BEGIN;
SELECT pg_advisory_xact_lock(20261028);
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations(version text PRIMARY KEY, statements text[],name text);
REVOKE ALL ON SCHEMA supabase_migrations FROM public,anon,authenticated;
REVOKE ALL ON supabase_migrations.schema_migrations FROM public,anon,authenticated;
DO $preflight$ BEGIN
 IF to_regprocedure('public.squad_command(text,jsonb)') IS NULL THEN RAISE EXCEPTION 'Install Phase 8 first.'; END IF;
 IF to_regclass('public.friendships') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='202610280001') THEN
 RAISE EXCEPTION 'Phase 9 tables exist without a migration record. Stop and inspect migration history; no tables were changed.';
 END IF;
END $preflight$;

DO $install$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='202610280001') THEN
 EXECUTE $migration$
-- Phase 9. Shared blocks retain Phase 8's transactional squad revocation trigger.
create table public.member_privacy (
 user_id uuid primary key references auth.users on delete cascade,
 discoverable boolean not null default false,
 allow_requests boolean not null default true,
 dm_policy text not null default 'friends' check(dm_policy in ('friends','members','nobody')),
 share_presence boolean not null default false,
 last_seen timestamptz
);
create table public.friendships (
 low_id uuid not null references auth.users on delete cascade,
 high_id uuid not null references auth.users on delete cascade,
 requested_by uuid not null references auth.users on delete cascade,
 status text not null default 'pending' check(status in ('pending','accepted')),
 created_at timestamptz not null default now(),
 primary key(low_id,high_id),check(low_id<high_id),check(requested_by in (low_id,high_id))
);
create index friendship_recipient on public.friendships(high_id,status);
create table public.conversations (
 id uuid primary key default gen_random_uuid(),
 low_id uuid not null references auth.users on delete cascade,
 high_id uuid not null references auth.users on delete cascade,
 created_at timestamptz not null default now(),unique(low_id,high_id),check(low_id<high_id)
);
create index conversation_recipient on public.conversations(high_id);
create table public.direct_messages (
 id uuid primary key,
 seq bigint generated always as identity unique,
 conversation_id uuid not null references public.conversations on delete cascade,
 sender_id uuid not null references auth.users on delete cascade,
 body text not null check(length(btrim(body)) between 1 and 4000 and body !~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]'),
 created_at timestamptz not null default now()
);
create index direct_message_history on public.direct_messages(conversation_id,seq desc);
create table public.conversation_preferences (
 conversation_id uuid not null references public.conversations on delete cascade,
 user_id uuid not null references auth.users on delete cascade,
 muted boolean not null default false,
 read_seq bigint not null default 0 check(read_seq>=0),
 primary key(conversation_id,user_id)
);
create table public.member_notifications (
 id bigint generated always as identity primary key,
 user_id uuid not null references auth.users on delete cascade,
 actor_id uuid not null references auth.users on delete cascade,
 kind text not null check(kind in ('friend_request','friend_accepted')),
 read_at timestamptz,created_at timestamptz not null default now()
);
create index member_notification_page on public.member_notifications(user_id,id desc);
create table public.direct_message_reports (
 id uuid primary key default gen_random_uuid(),
 message_id uuid not null references public.direct_messages on delete cascade,
 reporter_id uuid not null references auth.users on delete cascade,
 reason text not null check(length(btrim(reason)) between 5 and 1000),
 status text not null default 'pending' check(status in ('pending','reviewed','actioned','dismissed')),
 created_at timestamptz not null default now(),unique(message_id,reporter_id)
);
create table private.people_budgets (
 user_id uuid not null references auth.users on delete cascade,operation text not null,
 started_at timestamptz not null default now(),attempts integer not null default 0,
 primary key(user_id,operation)
);
insert into public.member_privacy(user_id) select id from auth.users;
create function private.bootstrap_privacy() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.member_privacy(user_id) values(new.id);return new;end $$;
create trigger member_privacy_bootstrap after insert on auth.users for each row execute function private.bootstrap_privacy();

create function private.people_pair(a uuid,b uuid) returns void language plpgsql security definer set search_path='' as $$
declare person uuid;begin
 -- Shared namespace with Squad Up. Acquire in sorted order before any row lock.
 for person in select distinct x from unnest(array[a,b]) t(x) where x is not null order by x loop
 perform pg_advisory_xact_lock(hashtextextended(person::text,719));end loop;
end $$;
create function private.people_friends(a uuid,b uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.squad_live(a) and private.squad_live(b) and not private.squad_blocked(a,b) and exists(select 1 from public.friendships where low_id=least(a,b) and high_id=greatest(a,b) and status='accepted');
$$;
create function private.people_visible(a uuid,b uuid) returns boolean language sql stable security definer set search_path='' as $$
 select a=b or (private.squad_live(a) and private.squad_live(b) and not private.squad_blocked(a,b) and exists(select 1 from public.profiles p join public.member_privacy v on v.user_id=p.id where p.id=b and v.discoverable and p.visibility<>'private'));
$$;
create function private.dm_access(c uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.squad_live(auth.uid()) and exists(select 1 from public.conversations where id=c and auth.uid() in (low_id,high_id) and private.squad_live(low_id) and private.squad_live(high_id) and not private.squad_blocked(low_id,high_id));
$$;
create function private.dm_send_allowed(a uuid,b uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.squad_live(a) and private.squad_live(b) and not private.squad_blocked(a,b) and exists(select 1 from public.member_privacy where user_id=b and (dm_policy='members' or (dm_policy='friends' and private.people_friends(a,b))));
$$;
create function private.people_card(a uuid,b uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',p.id,'username',p.username,'name',p.display_name,'avatar',p.avatar_path is not null and p.visibility<>'private',
 'online',case when v.share_presence and private.people_friends(a,b) then coalesce(v.last_seen>now()-interval '90 seconds',false) else null end,
 'relationship',coalesce((select case when status='accepted' then 'friends' when requested_by=a then 'outgoing' else 'incoming' end from public.friendships where low_id=least(a,b) and high_id=greatest(a,b)),'none'),
 'shared',case when v.discoverable and p.visibility<>'private' then (select coalesce(jsonb_agg(i),'[]'::jsonb) from (select unnest(interests) i from public.user_preferences where user_id=a intersect select unnest(interests) from public.user_preferences where user_id=b) q) else '[]'::jsonb end)
 from public.profiles p join public.member_privacy v on v.user_id=p.id where p.id=b and private.squad_live(b) and not private.squad_blocked(a,b);
$$;

create function public.people_budget(p_operation text) returns boolean language plpgsql security definer set search_path='' as $$
declare lim integer; period integer; n integer;begin
 if not private.squad_live(auth.uid()) then return false;end if;
 lim:=case p_operation when 'search' then 30 when 'request' then 10 when 'send' then 30 when 'heartbeat' then 6 else 30 end;
 period:=case when p_operation='request' then 3600 else 60 end;
 if p_operation not in ('search','request','send','heartbeat','control','report') then return false;end if;
 insert into private.people_budgets(user_id,operation,attempts) values(auth.uid(),p_operation,1)
 on conflict(user_id,operation) do update set attempts=case when private.people_budgets.started_at<clock_timestamp()-make_interval(secs=>period) then 1 else private.people_budgets.attempts+1 end,started_at=case when private.people_budgets.started_at<clock_timestamp()-make_interval(secs=>period) then clock_timestamp() else private.people_budgets.started_at end returning attempts into n;
 return n<=lim;
end $$;

create function public.people_search(p_query text default '',p_before text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;begin
 if not public.people_budget('search') then return jsonb_build_object('limited',true);end if;
 if length(p_query)>24 or (p_query<>'' and p_query !~ '^[a-z0-9_]{2,24}$') or length(p_before)>24 then raise exception 'Invalid search' using errcode='22023';end if;
 select coalesce(jsonb_agg(q.card order by q.username),'[]') into result from (
 select p.username,private.people_card(auth.uid(),p.id) card from public.profiles p
 where p.id<>auth.uid() and private.people_visible(auth.uid(),p.id) and (p_before is null or p.username>p_before)
 and (case when p_query<>'' then starts_with(p.username,p_query) else exists(select 1 from public.user_preferences x,public.user_preferences y where x.user_id=auth.uid() and y.user_id=p.id and x.interests && y.interests) end)
 order by p.username limit 21) q;
 return jsonb_build_object('items',result);
end $$;

create function public.people_home() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();begin
 if not private.squad_live(actor) then raise exception 'Not authorized' using errcode='42501';end if;
 return jsonb_build_object(
 'privacy',(select to_jsonb(v)-'user_id'-'last_seen' from public.member_privacy v where user_id=actor),
 'friends',coalesce((select jsonb_agg(private.people_card(actor,case when low_id=actor then high_id else low_id end) order by created_at desc) from public.friendships where actor in (low_id,high_id) and not private.squad_blocked(low_id,high_id) and private.squad_live(low_id) and private.squad_live(high_id)),'[]'),
 'conversations',coalesce((select jsonb_agg(q.item order by q.last_seq desc) from (
 select coalesce((select max(seq) from public.direct_messages where conversation_id=c.id),0) last_seq,
 jsonb_build_object('id',c.id,'member',private.people_card(actor,case when c.low_id=actor then c.high_id else c.low_id end),'muted',coalesce(cp.muted,false),
 'unread',(select count(*) from public.direct_messages where conversation_id=c.id and sender_id<>actor and seq>coalesce(cp.read_seq,0))) item
 from public.conversations c left join public.conversation_preferences cp on cp.conversation_id=c.id and cp.user_id=actor
 where private.dm_access(c.id) order by last_seq desc limit 500) q),'[]'),
 'notification_unread',(select count(*) from public.member_notifications where user_id=actor and read_at is null and not private.squad_blocked(actor,actor_id) and private.squad_live(actor_id)),
 'notifications',coalesce((select jsonb_agg(q.item order by q.id desc) from (select n.id,jsonb_build_object('id',n.id::text,'kind',n.kind,'member',private.people_card(actor,n.actor_id),'read',n.read_at is not null) item from public.member_notifications n where n.user_id=actor and not private.squad_blocked(actor,n.actor_id) and private.squad_live(n.actor_id) order by n.id desc limit 50) q),'[]'),
 'blocks',coalesce((select jsonb_agg(jsonb_build_object('id',blocked_id,'name',label)) from public.member_blocks where blocker_id=actor),'[]'));
end $$;

create function public.dm_history(p_conversation uuid,p_before bigint default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.conversations;other uuid;begin
 if not private.dm_access(p_conversation) then raise exception 'Conversation unavailable' using errcode='42501';end if;
 select * into c from public.conversations where id=p_conversation;other:=case when c.low_id=auth.uid() then c.high_id else c.low_id end;
 return jsonb_build_object('id',c.id,'member',private.people_card(auth.uid(),other),'can_send',private.dm_send_allowed(auth.uid(),other),
 'items',coalesce((select jsonb_agg(jsonb_build_object('id',id,'seq',seq::text,'sender',sender_id,'body',body,'created_at',created_at) order by seq) from (select * from public.direct_messages where conversation_id=c.id and (p_before is null or seq<p_before) order by seq desc limit 50) m),'[]'));
end $$;

create function public.people_command(p_operation text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();target uuid; c public.conversations;f public.friendships;msg public.direct_messages;item uuid; label_value text; category text;begin
 if not private.squad_live(actor) then raise exception 'Not authorized' using errcode='42501';end if;
 category:=case p_operation when 'request' then 'request' when 'send' then 'send' when 'heartbeat' then 'heartbeat' when 'report' then 'report' else 'control' end;
 if not public.people_budget(category) then return jsonb_build_object('limited',true);end if;
 if p_operation='privacy' then
  if jsonb_typeof(p_data->'discoverable')<>'boolean' or jsonb_typeof(p_data->'allow_requests')<>'boolean' or jsonb_typeof(p_data->'share_presence')<>'boolean' or coalesce(p_data->>'dm_policy','') not in ('friends','members','nobody') then raise exception 'Invalid preferences' using errcode='22023';end if;
  update public.member_privacy set discoverable=(p_data->>'discoverable')::boolean,allow_requests=(p_data->>'allow_requests')::boolean,share_presence=(p_data->>'share_presence')::boolean,dm_policy=p_data->>'dm_policy',last_seen=null where user_id=actor;
  return jsonb_build_object('ok',true);
 elsif p_operation='heartbeat' then
  update public.member_privacy set last_seen=clock_timestamp() where user_id=actor and share_presence;
  return jsonb_build_object('ok',true);
 elsif p_operation='notifications-read' then
  update public.member_notifications set read_at=now() where user_id=actor and read_at is null;return jsonb_build_object('ok',true);
 end if;
 if p_operation in ('send','read','mute','report') then
  select * into c from public.conversations where id=(p_data->>'conversation')::uuid;
  if not found or actor not in (c.low_id,c.high_id) then raise exception 'Conversation unavailable' using errcode='42501';end if;
  target:=case when c.low_id=actor then c.high_id else c.low_id end;
 else target:=(p_data->>'target')::uuid;
 end if;
 if target is null or target=actor then raise exception 'Invalid member' using errcode='22023';end if;
 perform private.people_pair(actor,target);
 if not private.squad_live(actor) then raise exception 'Not authorized' using errcode='42501';end if;
 if p_operation='unblock' then delete from public.member_blocks where blocker_id=actor and blocked_id=target;return jsonb_build_object('ok',true);end if;
 if p_operation='block' then
  -- Only an already permitted member can be targeted; no UUID enumeration endpoint.
  if not private.people_visible(actor,target) and not exists(select 1 from public.friendships where low_id=least(actor,target) and high_id=greatest(actor,target)) and not exists(select 1 from public.conversations where low_id=least(actor,target) and high_id=greatest(actor,target)) then raise exception 'Member unavailable' using errcode='42501';end if;
  if (select count(*) from public.member_blocks where blocker_id=actor)>=100 then raise exception 'Block list full' using errcode='54000';end if;
  select display_name into label_value from public.profiles where id=target;
  insert into public.member_blocks(blocker_id,blocked_id,label) values(actor,target,left(coalesce(label_value,'Member'),80)) on conflict do nothing;
  return jsonb_build_object('ok',true);
 end if;
 if not private.squad_live(target) or private.squad_blocked(actor,target) then raise exception 'Member unavailable' using errcode='42501';end if;
 select * into f from public.friendships where low_id=least(actor,target) and high_id=greatest(actor,target);
 if p_operation='request' then
  if not private.people_visible(actor,target) or not exists(select 1 from public.member_privacy where user_id=target and allow_requests) then raise exception 'Member unavailable' using errcode='42501';end if;
  if found and f.status is not null then return jsonb_build_object('ok',true);end if;
  if (select count(*) from public.friendships where actor in (low_id,high_id))>=500 or (select count(*) from public.friendships where target in (low_id,high_id))>=500 then raise exception 'Friend list full' using errcode='54000';end if;
  insert into public.friendships(low_id,high_id,requested_by) values(least(actor,target),greatest(actor,target),actor) on conflict do nothing;
  insert into public.member_notifications(user_id,actor_id,kind) values(target,actor,'friend_request');
 elsif p_operation='accept' then
  if f.status is distinct from 'pending' or f.requested_by=actor then raise exception 'Request unavailable' using errcode='42501';end if;
  update public.friendships set status='accepted' where low_id=f.low_id and high_id=f.high_id;
  insert into public.member_notifications(user_id,actor_id,kind) values(target,actor,'friend_accepted');
 elsif p_operation in ('decline','cancel','remove') then
  if f.status is null or (p_operation='decline' and (f.status<>'pending' or f.requested_by=actor)) or (p_operation='cancel' and (f.status<>'pending' or f.requested_by<>actor)) or (p_operation='remove' and f.status<>'accepted') then raise exception 'Request unavailable' using errcode='42501';end if;
  delete from public.friendships where low_id=f.low_id and high_id=f.high_id;
  delete from public.member_notifications where (user_id=actor and actor_id=target) or (user_id=target and actor_id=actor);
 elsif p_operation='open' then
  if not private.dm_send_allowed(actor,target) or (not private.people_friends(actor,target) and not private.people_visible(actor,target)) then raise exception 'Messaging unavailable' using errcode='42501';end if;
  if (select count(*) from public.conversations where actor in (low_id,high_id))>=500 and not exists(select 1 from public.conversations where low_id=least(actor,target) and high_id=greatest(actor,target)) then raise exception 'Conversation limit' using errcode='54000';end if;
  insert into public.conversations(low_id,high_id) values(least(actor,target),greatest(actor,target)) on conflict(low_id,high_id) do update set low_id=excluded.low_id returning * into c;
  return jsonb_build_object('id',c.id);
 elsif p_operation in ('send','read','mute','report') then
  if not private.dm_access(c.id) then raise exception 'Conversation unavailable' using errcode='42501';end if;
  if p_operation='send' then
   if not private.dm_send_allowed(actor,target) then raise exception 'Messaging unavailable' using errcode='42501';end if;
   item:=(p_data->>'id')::uuid;
   select * into msg from public.direct_messages where id=item;
   if found then if msg.sender_id<>actor or msg.conversation_id<>c.id then raise exception 'Invalid message' using errcode='42501';end if;return jsonb_build_object('id',msg.id);end if;
   insert into public.direct_messages(id,conversation_id,sender_id,body) values(item,c.id,actor,p_data->>'body');
   -- Only an invalidation is broadcast. History is always reauthorized by PostgreSQL.
   perform realtime.send(jsonb_build_object('id',item),'changed','dm:'||c.id::text,true);
   perform realtime.send('{}'::jsonb,'changed','people:'||target::text,true);
   return jsonb_build_object('id',item);
  elsif p_operation='read' then
   insert into public.conversation_preferences(conversation_id,user_id,read_seq) values(c.id,actor,coalesce((select max(seq) from public.direct_messages where conversation_id=c.id and seq<= (p_data->>'seq')::bigint),0))
   on conflict(conversation_id,user_id) do update set read_seq=greatest(public.conversation_preferences.read_seq,excluded.read_seq);
  elsif p_operation='mute' then
   if jsonb_typeof(p_data->'muted')<>'boolean' then raise exception 'Invalid preference' using errcode='22023';end if;
   insert into public.conversation_preferences(conversation_id,user_id,muted) values(c.id,actor,(p_data->>'muted')::boolean) on conflict(conversation_id,user_id) do update set muted=excluded.muted;
  else
   select * into msg from public.direct_messages where id=(p_data->>'message')::uuid and conversation_id=c.id and sender_id=target;
   if not found then raise exception 'Message unavailable' using errcode='42501';end if;
   insert into public.direct_message_reports(message_id,reporter_id,reason) values(msg.id,actor,p_data->>'reason') on conflict(message_id,reporter_id) do nothing;
  end if;
 else raise exception 'Invalid operation' using errcode='22023';end if;
 perform realtime.send('{}'::jsonb,'changed','people:'||actor::text,true);
 perform realtime.send('{}'::jsonb,'changed','people:'||target::text,true);
 return jsonb_build_object('ok',true);
end $$;

create function private.people_on_block() returns trigger language plpgsql security definer set search_path='' as $$
begin
 delete from public.friendships where low_id=least(new.blocker_id,new.blocked_id) and high_id=greatest(new.blocker_id,new.blocked_id);
 delete from public.member_notifications where (user_id=new.blocker_id and actor_id=new.blocked_id) or (user_id=new.blocked_id and actor_id=new.blocker_id);
 perform realtime.send('{}'::jsonb,'changed','people:'||new.blocker_id::text,true);
 perform realtime.send('{}'::jsonb,'changed','people:'||new.blocked_id::text,true);
 return new;
end $$;
create trigger people_on_block after insert on public.member_blocks for each row execute function private.people_on_block();
-- Invitations are bearer links; enforce the issuer/recipient block on redemption.
create function private.invitation_block_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.accepted_by is not null and old.accepted_by is null then
 perform private.people_pair(new.invited_by,new.accepted_by);
 if private.squad_blocked(new.invited_by,new.accepted_by) then raise exception 'Invitation unavailable' using errcode='42501';end if;
 end if;return new;
end $$;
create trigger invitation_block_guard before update on public.invitations for each row execute function private.invitation_block_guard();

create function public.people_topic_allowed(p_topic text) returns boolean language plpgsql stable security definer set search_path='' as $$
begin
 if not private.squad_live(auth.uid()) or p_topic is null then return false;end if;
 if p_topic='people:'||auth.uid()::text then return true;end if;
 if p_topic !~ '^dm:[a-f0-9-]{36}$' then return false;end if;
 return private.dm_access(substring(p_topic from 4)::uuid);
 exception when invalid_text_representation then return false;
end $$;
create policy people_receive on realtime.messages for select to authenticated using(extension='broadcast' and topic=(select realtime.topic()) and public.people_topic_allowed((select realtime.topic())));
create policy people_receive_guard on realtime.messages as restrictive for select to anon,authenticated using(coalesce((select realtime.topic()),'') !~ '^(people|dm):' or (extension='broadcast' and topic=(select realtime.topic()) and public.people_topic_allowed((select realtime.topic()))));
create policy people_no_send on realtime.messages as restrictive for insert to anon,authenticated with check(coalesce((select realtime.topic()),'') !~ '^(people|dm):');

alter table public.member_privacy enable row level security;
alter table public.friendships enable row level security;
alter table public.conversations enable row level security;
alter table public.direct_messages enable row level security;
alter table public.conversation_preferences enable row level security;
alter table public.member_notifications enable row level security;
alter table public.direct_message_reports enable row level security;
alter table private.people_budgets enable row level security;
revoke all on public.member_privacy,public.friendships,public.conversations,public.direct_messages,public.conversation_preferences,public.member_notifications,public.direct_message_reports,private.people_budgets from public,anon,authenticated;
grant select on public.member_privacy,public.friendships,public.conversations,public.direct_messages,public.conversation_preferences,public.member_notifications,public.direct_message_reports to authenticated;
create policy privacy_own on public.member_privacy for select to authenticated using(user_id=auth.uid() and private.is_verified_member());
create policy friendship_own on public.friendships for select to authenticated using(auth.uid() in (low_id,high_id) and private.is_verified_member() and not private.squad_blocked(low_id,high_id));
create policy conversation_own on public.conversations for select to authenticated using(private.dm_access(id));
create policy dm_own on public.direct_messages for select to authenticated using(private.dm_access(conversation_id));
create policy conversation_preferences_own on public.conversation_preferences for select to authenticated using(user_id=auth.uid() and private.dm_access(conversation_id));
create policy notification_own on public.member_notifications for select to authenticated using(user_id=auth.uid() and private.is_verified_member() and not private.squad_blocked(user_id,actor_id));
create policy dm_report_own on public.direct_message_reports for select to authenticated using(reporter_id=auth.uid() and private.is_verified_member());
-- Definer helpers are never general-purpose APIs. Only boolean policy helpers need execution grants.
revoke all on function private.bootstrap_privacy(),private.people_pair(uuid,uuid),private.people_friends(uuid,uuid),private.people_visible(uuid,uuid),private.dm_access(uuid),private.dm_send_allowed(uuid,uuid),private.people_card(uuid,uuid),private.people_on_block(),private.invitation_block_guard() from public,anon,authenticated;
grant execute on function private.dm_access(uuid) to authenticated;
revoke all on function public.people_budget(text),public.people_search(text,text),public.people_home(),public.dm_history(uuid,bigint),public.people_command(text,jsonb),public.people_topic_allowed(text) from public,anon;
grant execute on function public.people_budget(text),public.people_search(text,text),public.people_home(),public.dm_history(uuid,bigint),public.people_command(text,jsonb),public.people_topic_allowed(text) to authenticated;

$migration$;
 INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES('202610280001','people');
 ELSE RAISE NOTICE 'Migration 202610280001 already recorded; skipped.'; END IF;
END $install$;

DO $install$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='202610280002') THEN
 EXECUTE $migration$
-- Explicit boolean policy projection; raw private ACL functions remain revoked.
create function private.friendship_readable(a uuid,b uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() in (a,b) and private.squad_live(auth.uid()) and private.squad_live(a) and private.squad_live(b) and not private.squad_blocked(a,b);
$$;
revoke all on function private.friendship_readable(uuid,uuid) from public,anon;
grant execute on function private.friendship_readable(uuid,uuid) to authenticated;
alter policy friendship_own on public.friendships using(private.friendship_readable(low_id,high_id));
alter policy notification_own on public.member_notifications using(private.friendship_readable(user_id,actor_id) and user_id=auth.uid());
-- Authenticated blocks also apply to profile/portrait discovery, including direct URLs.
alter function public.visible_profile(text) rename to people_legacy_visible_profile;
alter function public.visible_avatar(uuid) rename to people_legacy_visible_avatar;
revoke all on function public.people_legacy_visible_profile(text),public.people_legacy_visible_avatar(uuid) from public,anon,authenticated;
create function public.visible_profile(p_username text)
returns table(id uuid,username text,display_name text,bio text,visibility text,has_avatar boolean,favorite_games text[],gaming_platforms text[])
language sql stable security definer set search_path='' as $$
 select p.* from public.people_legacy_visible_profile(p_username) p where auth.uid() is null or p.id=auth.uid() or not private.squad_blocked(auth.uid(),p.id);
$$;
create function public.visible_avatar(p_id uuid) returns text language sql stable security definer set search_path='' as $$
 select public.people_legacy_visible_avatar(p_id) where auth.uid() is null or p_id=auth.uid() or not private.squad_blocked(auth.uid(),p_id);
$$;
revoke all on function public.visible_profile(text),public.visible_avatar(uuid) from public;
grant execute on function public.visible_profile(text),public.visible_avatar(uuid) to anon,authenticated;

$migration$;
 INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES('202610280002','people_policy_guards');
 ELSE RAISE NOTICE 'Migration 202610280002 already recorded; skipped.'; END IF;
END $install$;

DO $install$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='202610280003') THEN
 EXECUTE $migration$
-- Backfill any accounts created while the initial privacy trigger was being installed.
insert into public.member_privacy(user_id) select id from auth.users on conflict do nothing;
-- Friends-only squads now use accepted friendships, rather than reciprocal social follows.
create or replace function private.squad_eligible(p_user uuid,s public.gaming_sessions) returns boolean language sql stable security definer set search_path='' as $$
 select private.squad_live(p_user) and private.squad_live(s.host_id)
 and (s.community_id is null or exists(select 1 from public.community_members m join public.community_roles r on r.id=m.role_id where m.community_id=s.community_id and m.user_id=s.host_id and m.status='active' and (not s.game_night or r.rank>=20)))
 and (p_user=s.host_id or (not private.squad_blocked(p_user,s.host_id) and case s.visibility
 when 'public' then true when 'friends' then private.people_friends(p_user,s.host_id)
 else exists(select 1 from public.community_members where community_id=s.community_id and user_id=p_user and status='active') end));
$$;
notify pgrst,'reload schema';

$migration$;
 INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES('202610280003','friend_audiences');
 ELSE RAISE NOTICE 'Migration 202610280003 already recorded; skipped.'; END IF;
END $install$;
NOTIFY pgrst,'reload schema';
COMMIT;
