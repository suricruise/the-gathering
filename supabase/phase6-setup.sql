-- The Gathering Phase 6: ONE-TIME LiveKit voice schema setup, after Phase 5.
-- Paste the ENTIRE file into Supabase SQL Editor and click Run once.
BEGIN;
DO $$ BEGIN
 IF to_regclass('public.voice_rooms') IS NOT NULL THEN
  RAISE EXCEPTION 'Voice tables already exist. Do not rerun setup; apply only pending versioned migrations.';
 END IF;
 IF to_regprocedure('public.chat_session(uuid)') IS NULL THEN
  RAISE EXCEPTION 'Install Phase 5 messaging first.';
 END IF;
END $$;

-- 202610250001_voice.sql
-- Voice admission is transactional; only the server holds LiveKit credentials.
create table public.voice_rooms (
 channel_id uuid primary key references public.channels(id) on delete cascade,
 epoch uuid not null default gen_random_uuid(),
 participant_limit integer not null default 12 check(participant_limit between 2 and 50),
 locked boolean not null default false
);
alter table public.voice_rooms enable row level security;
revoke all on public.voice_rooms from public,anon,authenticated;
grant select on public.voice_rooms to authenticated;
create policy voice_rooms_read on public.voice_rooms for select to authenticated using(public.channel_access(channel_id,'connect'));
create table private.voice_sessions (
 user_id uuid primary key references auth.users(id) on delete cascade,
 channel_id uuid not null references public.channels(id) on delete cascade,
 ticket uuid not null unique default gen_random_uuid(),
 epoch uuid not null,
 expires_at timestamptz not null default now()+interval '120 seconds'
);
create index voice_sessions_channel on private.voice_sessions(channel_id,expires_at);
create table private.voice_suspensions (
 channel_id uuid not null references public.channels(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 until_at timestamptz not null,
 primary key(channel_id,user_id)
);
create table private.voice_budget(user_id uuid not null references auth.users(id) on delete cascade, minute timestamptz not null, attempts integer not null, primary key(user_id,minute));
create table private.voice_worker(id boolean primary key default true check(id), checked_at timestamptz not null);
insert into private.voice_worker values(true,'1970-01-01');
alter table private.voice_sessions enable row level security;
alter table private.voice_suspensions enable row level security;
alter table private.voice_budget enable row level security;
alter table private.voice_worker enable row level security;
revoke all on private.voice_sessions,private.voice_suspensions,private.voice_budget,private.voice_worker from public,anon,authenticated;

-- Explicit-actor variant is PRIVATE, service use only, and mirrors channel_access.
create function private.voice_allowed(p_user uuid,p_channel uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare c public.channels; rid text; rank_value integer;
begin
 if not exists(select 1 from auth.users u join private.account_security s on s.user_id=u.id where u.id=p_user and u.email_confirmed_at is not null and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now())) then return false; end if;
 select * into c from public.channels where id=p_channel and kind='voice';
 if not found then return false; end if;
 select m.role_id,r.rank into rid,rank_value from public.community_members m join public.community_roles r on r.id=m.role_id where m.community_id=c.community_id and m.user_id=p_user and m.status='active';
 if not found then return false; end if;
 if exists(select 1 from private.voice_suspensions where channel_id=p_channel and user_id=p_user and until_at>now()) then return false; end if;
 if rank_value>=30 then return true; end if;
 if exists(select 1 from public.channel_permission_overrides o where o.channel_id=p_channel and (o.user_id=p_user or o.role_id=rid) and (not o.can_view or not o.can_connect)) then return false; end if;
 return not c.is_private or exists(select 1 from public.channel_permission_overrides o where o.channel_id=p_channel and (o.user_id=p_user or o.role_id=rid) and o.can_view and o.can_connect);
end $$;
create function private.voice_room_name(p_channel uuid,p_epoch uuid) returns text language sql immutable set search_path='' as $$ select 'tg_'||replace(p_channel::text,'-','')||'_'||replace(p_epoch::text,'-','') $$;

create function public.voice_admit(p_channel uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v public.voice_rooms; s private.voice_sessions; n integer; display text;
begin
 if not private.voice_allowed(auth.uid(),p_channel) then raise exception 'Voice access unavailable' using errcode='42501'; end if;
 -- A healthy independent worker is a prerequisite, not a browser-enforced check.
 if not exists(select 1 from private.voice_worker where checked_at>now()-interval '15 seconds') then raise exception 'Voice enforcement unavailable' using errcode='55000'; end if;
 insert into private.voice_budget values(auth.uid(),date_trunc('minute',now()),1) on conflict(user_id,minute) do update set attempts=private.voice_budget.attempts+1 returning attempts into n;
 if n>10 then return jsonb_build_object('limited',true); end if;
 delete from private.voice_budget where minute<now()-interval '1 day';
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,746));
 insert into public.voice_rooms(channel_id) values(p_channel) on conflict do nothing;
 select * into v from public.voice_rooms where channel_id=p_channel for update;
 if v.locked then raise exception 'Voice room is locked' using errcode='42501'; end if;
 select * into s from private.voice_sessions where user_id=auth.uid();
 if found and s.expires_at>now() then raise exception 'Leave your current voice session first' using errcode='55000'; end if;
 if (select count(*) from private.voice_sessions where channel_id=p_channel and epoch=v.epoch and expires_at>now())>=v.participant_limit then raise exception 'Voice room is full' using errcode='54000'; end if;
 insert into private.voice_sessions(user_id,channel_id,epoch) values(auth.uid(),p_channel,v.epoch) on conflict(user_id) do update set channel_id=excluded.channel_id,epoch=excluded.epoch,ticket=gen_random_uuid(),expires_at=now()+interval '120 seconds' returning * into s;
 select display_name into display from public.profiles where id=auth.uid();
 return jsonb_build_object('room',private.voice_room_name(v.channel_id,v.epoch),'ticket',s.ticket,'limit',v.participant_limit,'name',coalesce(display,'Member'));
end $$;
create function public.voice_session(p_ticket uuid,p_leave boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s private.voice_sessions; v public.voice_rooms; valid boolean;
begin
 select * into s from private.voice_sessions where user_id=auth.uid() and ticket=p_ticket for update;
 if not found then raise exception 'Voice session unavailable' using errcode='42501'; end if;
 select * into v from public.voice_rooms where channel_id=s.channel_id;
 valid:=private.voice_allowed(auth.uid(),s.channel_id) and not v.locked and v.epoch=s.epoch and s.expires_at>now() and exists(select 1 from private.voice_worker where checked_at>now()-interval '15 seconds');
 if p_leave or not coalesce(valid,false) then delete from private.voice_sessions where user_id=auth.uid();
 else update private.voice_sessions set expires_at=now()+interval '120 seconds' where user_id=auth.uid(); end if;
 return jsonb_build_object('allowed',coalesce(valid,false) and not p_leave,'room',private.voice_room_name(s.channel_id,s.epoch));
end $$;
create function public.voice_command(p_channel uuid,p_operation text,p_target uuid default null,p_limit integer default null,p_locked boolean default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.channels; own_rank integer; target_rank integer; v public.voice_rooms; n integer;
begin
 select * into c from public.channels where id=p_channel and kind='voice';
 own_rank:=private.community_rank(c.community_id);
 if own_rank<20 or not public.channel_access(p_channel,'connect') then raise exception 'Not authorized' using errcode='42501'; end if;
 insert into private.voice_budget values(auth.uid(),date_trunc('minute',now()),1) on conflict(user_id,minute) do update set attempts=private.voice_budget.attempts+1 returning attempts into n;
 if n>20 then return jsonb_build_object('limited',true); end if;
 insert into public.voice_rooms(channel_id) values(p_channel) on conflict do nothing;
 select * into v from public.voice_rooms where channel_id=p_channel for update;
 if p_operation='remove' then
  select r.rank into target_rank from public.community_members m join public.community_roles r on r.id=m.role_id where m.community_id=c.community_id and m.user_id=p_target;
  if p_target is null or p_target=auth.uid() or target_rank is null or own_rank<=target_rank then raise exception 'Not authorized' using errcode='42501'; end if;
  insert into private.voice_suspensions values(p_channel,p_target,now()+interval '15 minutes') on conflict(channel_id,user_id) do update set until_at=excluded.until_at;
  delete from private.voice_sessions where channel_id=p_channel and user_id=p_target;
 elsif p_operation='settings' then
  if own_rank<30 or p_limit is null or p_limit not between 2 and 50 or p_locked is null then raise exception 'Not authorized' using errcode='42501'; end if;
  update public.voice_rooms set participant_limit=p_limit,locked=p_locked,epoch=gen_random_uuid() where channel_id=p_channel;
  delete from private.voice_sessions where channel_id=p_channel;
 else raise exception 'Invalid voice operation' using errcode='22023'; end if;
 insert into public.community_audit_log(community_id,actor_id,target_id,action,detail) values(c.community_id,auth.uid(),p_target,'voice_'||p_operation,jsonb_build_object('channel_id',p_channel,'participant_limit',p_limit,'locked',p_locked));
 return jsonb_build_object('room',private.voice_room_name(v.channel_id,v.epoch));
end $$;
-- Only service role can obtain the cross-user enforcement snapshot or heartbeat.
create function public.voice_enforcement_snapshot() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('rooms',coalesce((select jsonb_agg(jsonb_build_object('room',private.voice_room_name(v.channel_id,v.epoch),'limit',v.participant_limit)) from public.voice_rooms v join public.channels c on c.id=v.channel_id where not v.locked and c.kind='voice'),'[]'::jsonb),
 'sessions',coalesce((select jsonb_agg(jsonb_build_object('identity',s.user_id,'ticket',s.ticket,'room',private.voice_room_name(s.channel_id,s.epoch))) from private.voice_sessions s join public.voice_rooms v on v.channel_id=s.channel_id where s.expires_at>now() and s.epoch=v.epoch and not v.locked and private.voice_allowed(s.user_id,s.channel_id)),'[]'::jsonb));
$$;
create function public.voice_worker_heartbeat() returns void language sql security definer set search_path='' as $$ update private.voice_worker set checked_at=clock_timestamp() where id $$;
revoke all on function private.voice_allowed(uuid,uuid),private.voice_room_name(uuid,uuid),public.voice_admit(uuid),public.voice_session(uuid,boolean),public.voice_command(uuid,text,uuid,integer,boolean),public.voice_enforcement_snapshot(),public.voice_worker_heartbeat() from public,anon,authenticated;
grant execute on function public.voice_admit(uuid),public.voice_session(uuid,boolean),public.voice_command(uuid,text,uuid,integer,boolean) to authenticated;
grant execute on function public.voice_enforcement_snapshot(),public.voice_worker_heartbeat() to service_role;
NOTIFY pgrst, 'reload schema';

-- 202610250002_voice_initial_rooms.sql
-- Real room definitions only; do not invent users, occupancy, or connections.
insert into public.channels(community_id,category_id,name,description,kind,is_private,position)
select c.id,(select id from public.channel_categories where community_id=c.id order by position,id limit 1),v.name,v.description,'voice',false,v.position
from public.communities c cross join (values
 ('the-lounge','The central Gathering lounge. Come as you are and enjoy good company.',50),
 ('squad-up','Find a party and coordinate your next match.',60),
 ('minecraft-voice','Build, explore, and talk Minecraft together.',70),
 ('valorant-voice','Team comms for your next Valorant match.',80),
 ('rocket-league-voice','Find a teammate for the next kickoff.',90)
) v(name,description,position)
where c.slug='the-gathering'
on conflict(community_id,name) do nothing;
update public.channels set description='A space for good company. Live audio uses LiveKit.'
where kind='voice' and description='A space for good company. Voice transport is not connected.';
NOTIFY pgrst, 'reload schema';

-- 202610250003_voice_request_limits.sql
-- Separate HTTP admission budgets commit even when a later authorization or
-- external LiveKit operation fails. RPC callers cannot mint provider tokens.
create table private.voice_http_budget (
 user_id uuid not null references auth.users(id) on delete cascade,
 operation text not null check(operation in ('token','control','session','leave')),
 minute timestamptz not null,
 attempts integer not null,
 primary key(user_id,operation,minute)
);
alter table private.voice_http_budget enable row level security;
revoke all on private.voice_http_budget from public,anon,authenticated;
create function public.voice_request_budget(p_operation text) returns boolean
language plpgsql security definer set search_path='' as $$
declare n integer; maximum integer;
begin
 if not private.is_verified_member() or p_operation not in ('token','control','session','leave') then return false; end if;
 maximum:=case when p_operation='token' then 10 when p_operation='control' then 20 else 60 end;
 insert into private.voice_http_budget values(auth.uid(),p_operation,date_trunc('minute',now()),1)
 on conflict(user_id,operation,minute) do update set attempts=private.voice_http_budget.attempts+1 returning attempts into n;
 delete from private.voice_http_budget where minute<now()-interval '1 day';
 return n<=maximum;
end $$;
revoke all on function public.voice_request_budget(text) from public,anon,authenticated;
grant execute on function public.voice_request_budget(text) to authenticated;
NOTIFY pgrst, 'reload schema';

CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (version text PRIMARY KEY, statements text[], name text);
REVOKE ALL ON SCHEMA supabase_migrations FROM public,anon,authenticated;
REVOKE ALL ON supabase_migrations.schema_migrations FROM public,anon,authenticated;
INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES
 ('202610250001','voice'),
 ('202610250002','voice_initial_rooms'),
 ('202610250003','voice_request_limits')
ON CONFLICT(version) DO NOTHING;
NOTIFY pgrst,'reload schema';
COMMIT;
