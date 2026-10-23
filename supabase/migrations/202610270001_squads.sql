-- Phase 8: authoritative LFG reservations, isolated group voice, no fabricated sessions.
create table public.game_platforms (
 game_id text references public.games(id) on delete cascade,
 platform_id text references public.platforms(id) on delete cascade,
 crossplay_pool text check(crossplay_pool ~ '^[a-z0-9-]{1,32}$'),
 primary key(game_id,platform_id)
);
insert into public.game_platforms values
 ('valorant','pc','pc'),('valorant','playstation','console'),('valorant','xbox','console'),
 ('minecraft','pc','bedrock'),('minecraft','playstation','bedrock'),('minecraft','xbox','bedrock'),('minecraft','switch','bedrock'),('minecraft','mobile','bedrock'),
 ('destiny-2','pc','all'),('destiny-2','playstation','all'),('destiny-2','xbox','all'),
 ('rocket-league','pc','all'),('rocket-league','playstation','all'),('rocket-league','xbox','all'),('rocket-league','switch','all'),
 ('apex-legends','pc','all'),('apex-legends','playstation','all'),('apex-legends','xbox','all'),
 ('stardew-valley','pc',null),('stardew-valley','playstation',null),('stardew-valley','xbox',null),('stardew-valley','switch',null),
 ('fortnite','pc','all'),('fortnite','playstation','all'),('fortnite','xbox','all'),('fortnite','switch','all'),('fortnite','mobile','all'),
 ('other','pc',null),('other','playstation',null),('other','xbox',null),('other','switch',null),('other','mobile',null)
on conflict do nothing;
alter table public.game_platforms enable row level security;
revoke all on public.game_platforms from public,anon,authenticated;
grant select on public.game_platforms to authenticated;
create policy game_platforms_read on public.game_platforms for select to authenticated using(private.is_verified_member());

create table private.squad_config (
 id boolean primary key default true check(id),
 duration_minutes integer not null default 360 check(duration_minutes between 30 and 1440),
 max_schedule_days integer not null default 30 check(max_schedule_days between 1 and 90),
 retention_days integer not null default 30 check(retention_days between 1 and 365),
 max_active_per_host integer not null default 5 check(max_active_per_host between 1 and 20),
 voice_early_minutes integer not null default 15 check(voice_early_minutes between 0 and 60)
);
insert into private.squad_config(id) values(true);
create table public.gaming_sessions (
 id uuid primary key, seq bigint generated always as identity unique,
 host_id uuid not null references auth.users(id) on delete cascade,
 title text not null check(char_length(title) between 3 and 80),
 description text not null check(char_length(description) between 1 and 2000),
 game_id text not null, platform_id text not null,
 foreign key(game_id,platform_id) references public.game_platforms(game_id,platform_id),
 cross_play boolean not null default false,
 play_style text not null check(play_style in ('casual','competitive')),
 max_players integer not null check(max_players between 2 and 50),
 requires_approval boolean not null default false,
 visibility text not null check(visibility in ('public','friends','community')),
 community_id uuid references public.communities(id) on delete cascade,
 game_night boolean not null default false,
 starts_at timestamptz, expires_at timestamptz not null,
 status text not null default 'open' check(status in ('open','cancelled','expired')),
 voice_epoch uuid not null default gen_random_uuid(),
 created_at timestamptz not null default clock_timestamp(), ended_at timestamptz,
 check((visibility='community')=(community_id is not null)),
 check(not game_night or visibility='community'), check(expires_at>created_at)
);
create index gaming_sessions_feed on public.gaming_sessions(status,seq desc);
create index gaming_sessions_game on public.gaming_sessions(game_id,platform_id,seq desc);
create index gaming_sessions_community on public.gaming_sessions(community_id,seq desc);
create index gaming_sessions_host on public.gaming_sessions(host_id,expires_at);
create index gaming_sessions_expiry on public.gaming_sessions(expires_at);
create table public.gaming_session_members (
 session_id uuid references public.gaming_sessions(id) on delete cascade,
 user_id uuid references auth.users(id) on delete cascade,
 platform_id text not null references public.platforms(id),
 status text not null check(status in ('accepted','pending','withdrawn','rejected','removed')),
 joined_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 primary key(session_id,user_id)
);
create index gaming_members_user on public.gaming_session_members(user_id,session_id);
create table public.member_blocks (
 blocker_id uuid references auth.users(id) on delete cascade,
 blocked_id uuid references auth.users(id) on delete cascade,
 label text not null check(char_length(label) between 1 and 80),
 created_at timestamptz not null default now(),
 primary key(blocker_id,blocked_id),check(blocker_id<>blocked_id)
);
create index member_blocks_target on public.member_blocks(blocked_id,blocker_id);
create table private.squad_budgets (
 user_id uuid references auth.users(id) on delete cascade,operation text not null,minute timestamptz not null,attempts integer not null,
 primary key(user_id,operation,minute)
);
create table private.squad_audit (
 id bigint generated always as identity primary key,
 session_id uuid references public.gaming_sessions(id) on delete set null,
 actor_id uuid references auth.users(id) on delete set null,
 target_id uuid references auth.users(id) on delete set null,
 action text not null,created_at timestamptz not null default now()
);
create table private.squad_voice_sessions (
 user_id uuid primary key references auth.users(id) on delete cascade,
 session_id uuid not null references public.gaming_sessions(id) on delete cascade,
 ticket uuid not null unique default gen_random_uuid(), epoch uuid not null,
 expires_at timestamptz not null default now()+interval '120 seconds'
);
create index squad_voice_session on private.squad_voice_sessions(session_id,expires_at);
alter table public.gaming_sessions enable row level security;
alter table public.gaming_session_members enable row level security;
alter table public.member_blocks enable row level security;
alter table private.squad_config enable row level security;
alter table private.squad_budgets enable row level security;
alter table private.squad_audit enable row level security;
alter table private.squad_voice_sessions enable row level security;
revoke all on public.gaming_sessions,public.gaming_session_members,public.member_blocks,private.squad_config,private.squad_budgets,private.squad_audit,private.squad_voice_sessions from public,anon,authenticated;
grant select(id,seq,title,description,game_id,platform_id,cross_play,play_style,max_players,requires_approval,visibility,community_id,game_night,starts_at,expires_at,status,created_at,ended_at) on public.gaming_sessions to authenticated;
grant select on public.gaming_session_members,public.member_blocks to authenticated;

create function private.squad_live(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users u join private.account_security a on a.user_id=u.id join public.profiles p on p.id=u.id where u.id=p_user and u.email_confirmed_at is not null and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now()) and p.onboarding_completed_at is not null);
$$;
create function private.squad_blocked(a uuid,b uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.member_blocks where (blocker_id=a and blocked_id=b) or (blocker_id=b and blocked_id=a));
$$;
create function private.squad_eligible(p_user uuid,s public.gaming_sessions) returns boolean language sql stable security definer set search_path='' as $$
 select private.squad_live(p_user) and private.squad_live(s.host_id)
 and (s.community_id is null or exists(select 1 from public.community_members m join public.community_roles r on r.id=m.role_id where m.community_id=s.community_id and m.user_id=s.host_id and m.status='active' and (not s.game_night or r.rank>=20)))
 and (p_user=s.host_id or (not private.squad_blocked(p_user,s.host_id) and case s.visibility
 when 'public' then true when 'friends' then exists(select 1 from public.follows where follower_id=p_user and followed_id=s.host_id) and exists(select 1 from public.follows where follower_id=s.host_id and followed_id=p_user)
 else exists(select 1 from public.community_members where community_id=s.community_id and user_id=p_user and status='active') end));
$$;
create function public.squad_access(p_session uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.gaming_sessions s where s.id=p_session and private.squad_eligible(auth.uid(),s));
$$;
create function private.squad_roster(p_session uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.squad_access(p_session) and exists(select 1 from public.gaming_sessions s where s.id=p_session and (s.host_id=auth.uid() or exists(select 1 from public.gaming_session_members m where m.session_id=s.id and m.user_id=auth.uid() and m.status='accepted')));
$$;
create policy gaming_sessions_read on public.gaming_sessions for select to authenticated using(public.squad_access(id));
create policy gaming_members_read on public.gaming_session_members for select to authenticated using(public.squad_access(session_id) and (user_id=auth.uid() or (private.squad_roster(session_id) and (status='accepted' or exists(select 1 from public.gaming_sessions s where s.id=session_id and s.host_id=auth.uid())))));
create policy member_blocks_read on public.member_blocks for select to authenticated using(blocker_id=auth.uid() and private.squad_live(auth.uid()));

create function private.squad_take(p_operation text,p_http boolean default false) returns boolean language plpgsql security definer set search_path='' as $$
declare n integer; maximum integer;
begin
 if not private.squad_live(auth.uid()) then return false; end if;
 maximum:=case when p_operation='create' then 5 when p_operation in ('join','withdraw','host') then 30 when p_operation='block' then 20 else 0 end;
 if maximum=0 then return false; end if;
 insert into private.squad_budgets values(auth.uid(),case when p_http then 'http:' else 'rpc:' end||p_operation,date_trunc('minute',now()),1)
 on conflict(user_id,operation,minute) do update set attempts=private.squad_budgets.attempts+1 returning attempts into n;
 delete from private.squad_budgets where minute<now()-interval '1 day';return n<=maximum;
end $$;
create function public.squad_budget(p_operation text) returns boolean language sql security definer set search_path='' as $$ select private.squad_take(p_operation,true) $$;
create function private.squad_compatible(s public.gaming_sessions,p_platform text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.game_platforms candidate join public.game_platforms base on base.game_id=candidate.game_id where candidate.game_id=s.game_id and candidate.platform_id=p_platform and base.platform_id=s.platform_id and (candidate.platform_id=base.platform_id or (s.cross_play and base.crossplay_pool is not null and base.crossplay_pool=candidate.crossplay_pool)));
$$;
create function private.squad_voice_allowed(p_user uuid,s public.gaming_sessions) returns boolean language sql stable security definer set search_path='' as $$
 select s.status='open' and s.expires_at>clock_timestamp() and (s.starts_at is null or s.starts_at<=clock_timestamp()+make_interval(mins=>(select voice_early_minutes from private.squad_config where id)))
 and private.squad_eligible(p_user,s) and exists(select 1 from public.gaming_session_members where session_id=s.id and user_id=p_user and status='accepted')
 and not exists(select 1 from public.gaming_session_members m where m.session_id=s.id and m.status='accepted' and m.user_id<>p_user and private.squad_eligible(m.user_id,s) and private.squad_blocked(p_user,m.user_id));
$$;
create function private.squad_dto(s public.gaming_sessions) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',s.id,'seq',s.seq::text,'title',s.title,'description',s.description,'game_id',s.game_id,'game_name',g.name,'platform_id',s.platform_id,'platform_name',pl.name,'cross_play',s.cross_play,'play_style',s.play_style,'max_players',s.max_players,'requires_approval',s.requires_approval,'visibility',s.visibility,'community_id',s.community_id,'community_name',c.name,'game_night',s.game_night,'starts_at',s.starts_at,'expires_at',s.expires_at,'created_at',s.created_at,
 'state',case when s.status<>'open' then s.status when s.expires_at<=clock_timestamp() then 'expired' when counts.accepted>=s.max_players then 'full' when s.starts_at>clock_timestamp() then 'scheduled' else 'open' end,
 'accepted_count',counts.accepted,'pending_count',case when s.host_id=auth.uid() then counts.pending else 0 end,'my_status',own.status,'is_host',s.host_id=auth.uid(),
 'host_id',case when ident.visible then s.host_id else null end,'host_name',case when ident.visible then pr.display_name else 'Private host' end,'host_avatar',ident.visible and public.visible_avatar(s.host_id) is not null,
 'voice_allowed',private.squad_voice_allowed(auth.uid(),s),'voice_opens_at',coalesce(s.starts_at,s.created_at)-make_interval(mins=>cfg.voice_early_minutes),
 'can_join',s.status='open' and s.expires_at>clock_timestamp() and counts.accepted<s.max_players and coalesce(own.status,'') not in ('accepted','pending','removed','rejected') and not exists(select 1 from public.gaming_session_members m where m.session_id=s.id and m.status='accepted' and private.squad_eligible(m.user_id,s) and private.squad_blocked(auth.uid(),m.user_id)),
 'compatible_platforms',(select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name) order by p.name) from public.platforms p where private.squad_compatible(s,p.id)),
 'members',case when private.squad_roster(s.id) then coalesce((select jsonb_agg(jsonb_build_object('id',m.user_id,'name',p.display_name,'avatar',public.visible_avatar(m.user_id) is not null,'platform',p2.name,'status',m.status,'host',m.user_id=s.host_id) order by (m.user_id=s.host_id) desc,m.joined_at,m.user_id) from public.gaming_session_members m join public.profiles p on p.id=m.user_id join public.platforms p2 on p2.id=m.platform_id where m.session_id=s.id and (m.status='accepted' or s.host_id=auth.uid())),'[]') else '[]'::jsonb end)
 from public.games g join public.platforms pl on pl.id=s.platform_id join public.profiles pr on pr.id=s.host_id
 left join public.user_preferences prefs on prefs.user_id=s.host_id left join public.communities c on c.id=s.community_id
 left join public.gaming_session_members own on own.session_id=s.id and own.user_id=auth.uid()
 cross join private.squad_config cfg cross join lateral(select count(*) filter(where status='accepted') accepted,count(*) filter(where status='pending') pending from public.gaming_session_members where session_id=s.id)counts
 cross join lateral(select s.host_id=auth.uid() or private.squad_roster(s.id) or (pr.visibility<>'private' and coalesce(prefs.show_gaming_activity,false)) visible)ident
 where g.id=s.game_id and cfg.id;
$$;
create function public.squad_detail(p_session uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select private.squad_dto(s) from public.gaming_sessions s where s.id=p_session and private.squad_eligible(auth.uid(),s);
$$;
create function public.squad_list(p_mode text default 'discover',p_game text default null,p_platform text default null,p_slots integer default 0,p_when text default 'any',p_style text default null,p_community uuid default null,p_before bigint default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare rows jsonb; cursor_value text;
begin
 if not private.squad_live(auth.uid()) then raise exception 'Not authorized' using errcode='42501';end if;
 if p_mode not in ('discover','mine','game-nights') or p_when not in ('any','now','day','week','scheduled') or p_slots is null or p_slots not between 0 and 49 or (p_style is not null and p_style not in ('casual','competitive')) then raise exception 'Invalid filters' using errcode='22023';end if;
 select coalesce(jsonb_agg(dto order by seq desc),'[]'),case when count(*)=20 then min(seq)::text else null end into rows,cursor_value from (
 select s.seq,private.squad_dto(s)dto from public.gaming_sessions s where private.squad_eligible(auth.uid(),s)
 and (p_mode='mine' and (s.host_id=auth.uid() or exists(select 1 from public.gaming_session_members m where m.session_id=s.id and m.user_id=auth.uid())) or p_mode<>'mine' and s.status='open' and s.expires_at>clock_timestamp())
 and (p_mode<>'game-nights' or s.game_night) and (p_game is null or s.game_id=p_game) and (p_platform is null or private.squad_compatible(s,p_platform)) and (p_community is null or s.community_id=p_community)
 and (p_style is null or s.play_style=p_style) and (p_before is null or s.seq<p_before)
 and s.max_players-(select count(*) from public.gaming_session_members where session_id=s.id and status='accepted')>=p_slots
 and (p_when='any' or (p_when='now' and (s.starts_at is null or s.starts_at<=clock_timestamp()+interval '15 minutes')) or (p_when='day' and coalesce(s.starts_at,clock_timestamp())<=clock_timestamp()+interval '24 hours') or (p_when='week' and coalesce(s.starts_at,clock_timestamp())<=clock_timestamp()+interval '7 days') or (p_when='scheduled' and s.starts_at>clock_timestamp())) order by s.seq desc limit 20)page;
 return jsonb_build_object('items',rows,'next',cursor_value);
end $$;

-- Blocking withdraws the blocker from shared groups, or removes the target when
-- the blocker hosts. Unblocking never silently restores a reserved place.
create function private.squad_on_block() returns trigger language plpgsql security definer set search_path='' as $$
declare s public.gaming_sessions;
begin
 for s in select g.* from public.gaming_sessions g where exists(select 1 from public.gaming_session_members a join public.gaming_session_members b on a.session_id=b.session_id where a.session_id=g.id and a.user_id=new.blocker_id and b.user_id=new.blocked_id and a.status in ('accepted','pending') and b.status in ('accepted','pending')) order by g.id for update of g loop
  update public.gaming_session_members set status=case when s.host_id=new.blocker_id then 'removed' else 'withdrawn' end,updated_at=clock_timestamp() where session_id=s.id and user_id=case when s.host_id=new.blocker_id then new.blocked_id else new.blocker_id end;
  delete from private.squad_voice_sessions where session_id=s.id and user_id in (new.blocker_id,new.blocked_id);
  insert into private.squad_audit(session_id,actor_id,target_id,action) values(s.id,new.blocker_id,new.blocked_id,'block_separation');
 end loop;return new;
end $$;
create trigger squad_member_block after insert on public.member_blocks for each row execute function private.squad_on_block();

create function public.squad_command(p_operation text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); s public.gaming_sessions; m public.gaming_session_members; cfg private.squad_config; item uuid; target uuid; txt text; label_value text; begins timestamptz; desired text; n integer; budget text;
begin
 if not private.squad_live(actor) then raise exception 'Not authorized' using errcode='42501';end if;
 budget:=case when p_operation='create' then 'create' when p_operation='join' then 'join' when p_operation='withdraw' then 'withdraw' when p_operation in ('block-host','block-member','unblock') then 'block' else 'host' end;
 if not private.squad_take(budget) then return jsonb_build_object('limited',true);end if;
 if p_operation='unblock' then delete from public.member_blocks where blocker_id=actor and blocked_id=(p_data->>'target')::uuid;return jsonb_build_object('ok',true);end if;
 if p_operation in ('block-host','block-member') then
  select * into s from public.gaming_sessions where id=(p_data->>'session')::uuid;
  if not found or not private.squad_eligible(actor,s) then raise exception 'Session unavailable' using errcode='42501';end if;
  if p_operation='block-host' then target:=s.host_id;label_value:=(private.squad_dto(s)->>'host_name');
  else
   target:=(p_data->>'target')::uuid;
   if s.host_id<>actor or not exists(select 1 from public.gaming_session_members where session_id=s.id and user_id=target) then raise exception 'Not authorized' using errcode='42501';end if;
   select display_name into label_value from public.profiles where id=target;
  end if;
  if target=actor then raise exception 'Invalid member' using errcode='22023';end if;
  if (select count(*) from public.member_blocks where blocker_id=actor)>=100 then raise exception 'Block list is full' using errcode='54000';end if;
  insert into public.member_blocks(blocker_id,blocked_id,label) values(actor,target,left(coalesce(nullif(label_value,''),'Member'),80)) on conflict do nothing;
  return jsonb_build_object('ok',true);
 end if;
 select * into cfg from private.squad_config where id;
 if p_operation='create' then
  item:=(p_data->>'id')::uuid;
  perform pg_advisory_xact_lock(hashtextextended(actor::text,718));
  select * into s from public.gaming_sessions where id=item;
  if found then if s.host_id<>actor then raise exception 'Not authorized' using errcode='42501';end if;return jsonb_build_object('id',s.id);end if;
  if exists(select 1 from public.channels where id=item) then raise exception 'Invalid session ID' using errcode='22023';end if;
  if (select count(*) from public.gaming_sessions where host_id=actor and status='open' and expires_at>clock_timestamp())>=cfg.max_active_per_host then raise exception 'Too many active sessions' using errcode='54000';end if;
  begins:=nullif(p_data->>'starts_at','')::timestamptz;
  if begins is not null and (begins<clock_timestamp()-interval '1 minute' or begins>clock_timestamp()+make_interval(days=>cfg.max_schedule_days)) then raise exception 'Invalid start time' using errcode='22023';end if;
  if coalesce(p_data->>'title','') ~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]' or btrim(coalesce(p_data->>'title',''))='' or coalesce(p_data->>'description','') ~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]' or btrim(coalesce(p_data->>'description',''))='' then raise exception 'Invalid description' using errcode='22023';end if;
  insert into public.gaming_sessions(id,host_id,title,description,game_id,platform_id,cross_play,play_style,max_players,requires_approval,visibility,community_id,game_night,starts_at,expires_at)
  values(item,actor,p_data->>'title',p_data->>'description',p_data->>'game',p_data->>'platform',(p_data->>'cross_play')::boolean,p_data->>'style',(p_data->>'max_players')::integer,(p_data->>'approval')::boolean,p_data->>'visibility',nullif(p_data->>'community','')::uuid,(p_data->>'game_night')::boolean,begins,greatest(coalesce(begins,clock_timestamp()),clock_timestamp())+make_interval(mins=>cfg.duration_minutes)) returning * into s;
  if not private.squad_eligible(actor,s) then raise exception 'Not authorized' using errcode='42501';end if;
  if s.cross_play and not exists(select 1 from public.game_platforms base join public.game_platforms other on other.game_id=base.game_id and other.platform_id<>base.platform_id and other.crossplay_pool=base.crossplay_pool where base.game_id=s.game_id and base.platform_id=s.platform_id) then raise exception 'Cross-play not supported for this platform' using errcode='22023';end if;
  insert into public.gaming_session_members values(s.id,actor,s.platform_id,'accepted',clock_timestamp(),clock_timestamp());
  insert into private.squad_audit(session_id,actor_id,action) values(s.id,actor,'create');return jsonb_build_object('id',s.id);
 end if;
 item:=(p_data->>'session')::uuid;
 select * into s from public.gaming_sessions where id=item for update;
 if not found then raise exception 'Session unavailable' using errcode='42501';end if;
 if p_operation='withdraw' then
  if s.host_id=actor then raise exception 'Hosts must cancel their session' using errcode='22023';end if;
  update public.gaming_session_members set status='withdrawn',updated_at=clock_timestamp() where session_id=s.id and user_id=actor and status in ('accepted','pending');
  delete from private.squad_voice_sessions where session_id=s.id and user_id=actor;
  insert into private.squad_audit(session_id,actor_id,action) values(s.id,actor,'withdraw');return jsonb_build_object('id',s.id);
 end if;
 if not private.squad_eligible(actor,s) then raise exception 'Session unavailable' using errcode='42501';end if;
 if p_operation='cancel' then
  if s.host_id<>actor then raise exception 'Not authorized' using errcode='42501';end if;
  if s.status='open' then update public.gaming_sessions set status='cancelled',ended_at=clock_timestamp(),voice_epoch=gen_random_uuid() where id=s.id;delete from private.squad_voice_sessions where session_id=s.id;insert into private.squad_audit(session_id,actor_id,action) values(s.id,actor,'cancel');end if;
  return jsonb_build_object('id',s.id);
 end if;
 if s.status<>'open' or s.expires_at<=clock_timestamp() then raise exception 'Session has ended' using errcode='55000';end if;
 if p_operation='join' then
  if not private.squad_compatible(s,p_data->>'platform') then raise exception 'Choose a compatible platform' using errcode='22023';end if;
  if exists(select 1 from public.gaming_session_members other where other.session_id=s.id and other.status='accepted' and private.squad_eligible(other.user_id,s) and private.squad_blocked(actor,other.user_id)) then raise exception 'Session unavailable' using errcode='42501';end if;
  select * into m from public.gaming_session_members where session_id=s.id and user_id=actor;
  if found and m.status in ('accepted','pending') then return jsonb_build_object('id',s.id,'status',m.status);end if;
  if found and m.status in ('removed','rejected') then raise exception 'Session unavailable' using errcode='42501';end if;
  if (select count(*) from public.gaming_session_members where session_id=s.id and status='accepted')>=s.max_players then raise exception 'Session is full' using errcode='54000';end if;
  if s.requires_approval and (select count(*) from public.gaming_session_members where session_id=s.id and status='pending')>=50 then raise exception 'Approval queue is full' using errcode='54000';end if;
  desired:=case when s.requires_approval then 'pending' else 'accepted' end;
  insert into public.gaming_session_members values(s.id,actor,p_data->>'platform',desired,clock_timestamp(),clock_timestamp()) on conflict(session_id,user_id) do update set status=excluded.status,platform_id=excluded.platform_id,updated_at=excluded.updated_at;
  insert into private.squad_audit(session_id,actor_id,action) values(s.id,actor,desired);return jsonb_build_object('id',s.id,'status',desired);
 end if;
 if p_operation not in ('approve','reject','remove') or s.host_id<>actor then raise exception 'Not authorized' using errcode='42501';end if;
 target:=(p_data->>'target')::uuid;
 if target=actor then raise exception 'Invalid member' using errcode='22023';end if;
 select * into m from public.gaming_session_members where session_id=s.id and user_id=target;
 if not found then raise exception 'Member unavailable' using errcode='42501';end if;
 if p_operation='approve' then
  if m.status<>'pending' or not private.squad_eligible(target,s) or not private.squad_compatible(s,m.platform_id) or exists(select 1 from public.gaming_session_members other where other.session_id=s.id and other.status='accepted' and private.squad_eligible(other.user_id,s) and private.squad_blocked(target,other.user_id)) then raise exception 'Member unavailable' using errcode='42501';end if;
  if (select count(*) from public.gaming_session_members where session_id=s.id and status='accepted')>=s.max_players then raise exception 'Session is full' using errcode='54000';end if;
  desired:='accepted';
 elsif p_operation='reject' then if m.status<>'pending' then raise exception 'Invalid member status' using errcode='22023';end if;desired:='rejected';
 else desired:='removed';end if;
 update public.gaming_session_members set status=desired,updated_at=clock_timestamp() where session_id=s.id and user_id=target;
 delete from private.squad_voice_sessions where session_id=s.id and user_id=target;
 insert into private.squad_audit(session_id,actor_id,target_id,action) values(s.id,actor,target,p_operation);
 return jsonb_build_object('id',s.id);
end $$;

-- Wrap, rather than loosen, the existing community voice authorization.
alter function public.voice_admit(uuid) set schema private;
alter function private.voice_admit(uuid) rename to community_voice_admit;
alter function public.voice_session(uuid,boolean) set schema private;
alter function private.voice_session(uuid,boolean) rename to community_voice_session;
alter function public.voice_enforcement_snapshot() set schema private;
alter function private.voice_enforcement_snapshot() rename to community_voice_enforcement_snapshot;
revoke all on function private.community_voice_admit(uuid),private.community_voice_session(uuid,boolean),private.community_voice_enforcement_snapshot() from public,anon,authenticated,service_role;
create function public.voice_admit(p_channel uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.gaming_sessions; v private.squad_voice_sessions; display text;
begin
 if not private.is_verified_member() then raise exception 'Voice access unavailable' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,746));
 if exists(select 1 from private.squad_voice_sessions where user_id=auth.uid() and expires_at>clock_timestamp()) then raise exception 'Leave your current voice session first' using errcode='55000';end if;
 select * into s from public.gaming_sessions where id=p_channel for update;
 if not found then return private.community_voice_admit(p_channel);end if;
 if not private.squad_voice_allowed(auth.uid(),s) then raise exception 'Voice access unavailable' using errcode='42501';end if;
 if not exists(select 1 from private.voice_worker where checked_at>clock_timestamp()-interval '15 seconds') then raise exception 'Voice enforcement unavailable' using errcode='55000';end if;
 if exists(select 1 from private.voice_sessions where user_id=auth.uid() and expires_at>clock_timestamp()) then raise exception 'Leave your current voice session first' using errcode='55000';end if;
 if not private.squad_take('join') then return jsonb_build_object('limited',true);end if;
 if (select count(*) from private.squad_voice_sessions where session_id=s.id and epoch=s.voice_epoch and expires_at>clock_timestamp())>=s.max_players then raise exception 'Voice room is full' using errcode='54000';end if;
 insert into private.squad_voice_sessions(user_id,session_id,epoch) values(auth.uid(),s.id,s.voice_epoch) on conflict(user_id) do update set session_id=excluded.session_id,epoch=excluded.epoch,ticket=gen_random_uuid(),expires_at=clock_timestamp()+interval '120 seconds' returning * into v;
 select display_name into display from public.profiles where id=auth.uid();
 return jsonb_build_object('room',private.voice_room_name(s.id,s.voice_epoch),'ticket',v.ticket,'limit',s.max_players,'name',coalesce(display,'Member'),'destination','/squad-up/'||s.id::text);
end $$;
create function public.voice_session(p_ticket uuid,p_leave boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare v private.squad_voice_sessions; s public.gaming_sessions; valid boolean;
begin
 select * into v from private.squad_voice_sessions where user_id=auth.uid() and ticket=p_ticket for update;
 if not found then return private.community_voice_session(p_ticket,p_leave);end if;
 select * into s from public.gaming_sessions where id=v.session_id;
 valid:=private.squad_voice_allowed(auth.uid(),s) and s.voice_epoch=v.epoch and v.expires_at>clock_timestamp() and exists(select 1 from private.voice_worker where checked_at>clock_timestamp()-interval '15 seconds');
 if p_leave or not coalesce(valid,false) then delete from private.squad_voice_sessions where user_id=auth.uid();else update private.squad_voice_sessions set expires_at=clock_timestamp()+interval '120 seconds' where user_id=auth.uid();end if;
 return jsonb_build_object('allowed',coalesce(valid,false) and not p_leave,'room',private.voice_room_name(v.session_id,v.epoch));
end $$;
create function public.voice_enforcement_snapshot() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('rooms',base->'rooms'||coalesce((select jsonb_agg(jsonb_build_object('room',private.voice_room_name(s.id,s.voice_epoch),'limit',s.max_players)) from public.gaming_sessions s where private.squad_voice_allowed(s.host_id,s)),'[]'),
 'sessions',base->'sessions'||coalesce((select jsonb_agg(jsonb_build_object('identity',v.user_id,'ticket',v.ticket,'room',private.voice_room_name(v.session_id,v.epoch))) from private.squad_voice_sessions v join public.gaming_sessions s on s.id=v.session_id where v.expires_at>clock_timestamp() and v.epoch=s.voice_epoch and private.squad_voice_allowed(v.user_id,s)),'[]')) from (select private.community_voice_enforcement_snapshot() base)x;
$$;
create function public.squad_cleanup(p_limit integer default 500) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.gaming_sessions; cfg private.squad_config; expired_n integer:=0; deleted_n integer:=0;
begin
 select * into cfg from private.squad_config where id;
 for s in select g.* from public.gaming_sessions g where (g.status='open' and (g.expires_at<=clock_timestamp() or not private.squad_eligible(g.host_id,g) or exists(select 1 from public.gaming_session_members m where m.session_id=g.id and m.status in ('accepted','pending') and not private.squad_eligible(m.user_id,g)))) or coalesce(g.ended_at,g.expires_at)<clock_timestamp()-make_interval(days=>cfg.retention_days) order by g.expires_at,g.id limit least(greatest(p_limit,1),500) for update skip locked loop
  if s.status='open' and (s.expires_at<=clock_timestamp() or not private.squad_eligible(s.host_id,s)) then update public.gaming_sessions set status='expired',ended_at=clock_timestamp() where id=s.id;delete from private.squad_voice_sessions where session_id=s.id;expired_n:=expired_n+1;end if;
  update public.gaming_session_members set status='removed',updated_at=clock_timestamp() where session_id=s.id and user_id<>s.host_id and status in ('accepted','pending') and not private.squad_eligible(user_id,s);
  if coalesce(s.ended_at,s.expires_at)<clock_timestamp()-make_interval(days=>cfg.retention_days) then delete from public.gaming_sessions where id=s.id;deleted_n:=deleted_n+1;end if;
 end loop;
 delete from private.squad_voice_sessions v where v.expires_at<=clock_timestamp() or not exists(select 1 from public.gaming_sessions s where s.id=v.session_id and private.squad_voice_allowed(v.user_id,s));
 delete from private.squad_audit where created_at<clock_timestamp()-make_interval(days=>cfg.retention_days);
 delete from private.squad_budgets where minute<clock_timestamp()-interval '1 day';
 return jsonb_build_object('expired',expired_n,'deleted',deleted_n);
end $$;
revoke all on function private.squad_live(uuid),private.squad_blocked(uuid,uuid),private.squad_eligible(uuid,public.gaming_sessions),private.squad_roster(uuid),private.squad_take(text,boolean),private.squad_compatible(public.gaming_sessions,text),private.squad_voice_allowed(uuid,public.gaming_sessions),private.squad_dto(public.gaming_sessions),private.squad_on_block(),public.squad_access(uuid),public.squad_budget(text),public.squad_detail(uuid),public.squad_list(text,text,text,integer,text,text,uuid,bigint),public.squad_command(text,jsonb),public.voice_admit(uuid),public.voice_session(uuid,boolean),public.voice_enforcement_snapshot(),public.squad_cleanup(integer) from public,anon,authenticated;
grant execute on function private.squad_live(uuid),private.squad_roster(uuid),public.squad_access(uuid),public.squad_budget(text),public.squad_detail(uuid),public.squad_list(text,text,text,integer,text,text,uuid,bigint),public.squad_command(text,jsonb),public.voice_admit(uuid),public.voice_session(uuid,boolean) to authenticated;
grant execute on function public.voice_enforcement_snapshot(),public.squad_cleanup(integer) to service_role;
notify pgrst,'reload schema';
