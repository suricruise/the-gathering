-- Explicit community associations only; no backfill, reclassification or seed.
create table private.faith_circle_leaders (
 user_id uuid primary key references auth.users(id) on delete cascade,
 approved boolean not null default false,
 updated_at timestamptz not null default now()
);
create table public.faith_circles (
 community_id uuid primary key references public.communities(id) on delete cascade,
 leader_id uuid references auth.users(id) on delete set null,
 discussion_channel_id uuid references public.channels(id) on delete set null,
 hangout_channel_id uuid references public.channels(id) on delete set null,
 study_title text not null default '' check(char_length(study_title)<=120),
 passage_reference text not null default '' check(char_length(passage_reference)<=100 and (passage_reference='' or passage_reference ~ '^[1-4]? ?[A-Za-z]+( [A-Za-z]+){0,3} [1-9][0-9]{0,2}(:[1-9][0-9]{0,2}(-[1-9][0-9]{0,2})?)?$')),
 schedule_note text not null default '' check(char_length(schedule_note)<=240),
 featured boolean not null default false,
 enabled boolean not null default true,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check((study_title='' and passage_reference='') or (length(btrim(study_title))>0 and passage_reference<>''))
);
create index faith_circles_leader on public.faith_circles(leader_id);
create index faith_circles_featured on public.faith_circles(community_id) where enabled and featured;
alter table private.faith_circle_leaders enable row level security;
alter table public.faith_circles enable row level security;
-- Default-deny RLS plus no normal table grants: even raw private channel IDs stay private.
revoke all on private.faith_circle_leaders,public.faith_circles from public,anon,authenticated;

create function private.faith_circle_validate() returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_op='UPDATE' and new.community_id<>old.community_id then raise exception 'Circle association cannot be moved' using errcode='22023';end if;
 if new.leader_id is null then
  if tg_op='INSERT' then raise exception 'An approved current leader is required' using errcode='22023';end if;
  -- Auth deletion must not delete a community or block account cleanup.
  new.enabled:=false;
 elsif new.enabled and (not exists(select 1 from private.faith_circle_leaders where user_id=new.leader_id and approved) or private.space_rank(new.leader_id,new.community_id)<10) then
  raise exception 'An approved current community leader is required' using errcode='42501';
 end if;
 if new.discussion_channel_id is not null and not exists(select 1 from public.channels where id=new.discussion_channel_id and community_id=new.community_id and kind='text') then raise exception 'Invalid Circle discussion channel' using errcode='22023';end if;
 if new.hangout_channel_id is not null and not exists(select 1 from public.channels where id=new.hangout_channel_id and community_id=new.community_id and kind='voice') then raise exception 'Invalid Circle Hangout' using errcode='22023';end if;
 new.updated_at:=now();return new;
end$$;
create trigger faith_circle_validate before insert or update on public.faith_circles for each row execute function private.faith_circle_validate();
create function private.faith_circle_audit() returns trigger language plpgsql security definer set search_path='' as $$begin
 insert into public.community_audit_log(community_id,actor_id,target_id,action,detail) values(new.community_id,auth.uid(),new.leader_id,'faith_circle_settings',jsonb_build_object('enabled',new.enabled,'featured',new.featured,'leader',new.leader_id,'source','trusted_operator'));
 return new;
end$$;
create trigger faith_circle_audit after insert or update on public.faith_circles for each row execute function private.faith_circle_audit();
create function private.faith_leader_audit() returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_op='INSERT' or new.approved is distinct from old.approved then
  insert into private.admin_audit(actor_id,action,target_id,reason) values(auth.uid(),'faith_leader_approval',new.user_id,case when new.approved then 'Trusted operator approved Faith Circles leadership.' else 'Trusted operator revoked Faith Circles leadership.' end);
 end if;new.updated_at:=now();return new;
end$$;
create trigger faith_leader_audit before insert or update on private.faith_circle_leaders for each row execute function private.faith_leader_audit();

create function private.faith_circle_allowed(cid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.squad_live(auth.uid()) and exists(select 1 from public.faith_circles f
 join private.faith_circle_leaders l on l.user_id=f.leader_id and l.approved
 join public.communities c on c.id=f.community_id
 where f.community_id=cid and f.enabled and not c.archived and public.community_access(cid)
 and private.space_rank(f.leader_id,cid)>=10 and not private.squad_blocked(auth.uid(),f.leader_id)
 and not exists(select 1 from public.community_members m where m.community_id=cid and m.user_id=auth.uid() and m.status='banned'));
$$;
create function private.faith_circle_card(cid uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare f public.faith_circles;c public.communities;r integer;person jsonb;leader jsonb;discussion jsonb;hangout jsonb;begin
 if not private.faith_circle_allowed(cid) then return null;end if;
 select * into f from public.faith_circles where community_id=cid;
 select * into c from public.communities where id=cid;r:=private.community_rank(cid);
 if r>0 or exists(select 1 from public.profiles p cross join lateral public.visible_profile(p.username) v where p.id=f.leader_id and v.id=p.id) then
  person:=private.people_card(auth.uid(),f.leader_id);
  leader:=jsonb_build_object('id',person->'id','name',person->'name','username',person->'username','avatar',person->'avatar');
 end if;
 if r>0 then
  select jsonb_build_object('id',id,'name',name) into discussion from public.channels where id=f.discussion_channel_id and community_id=cid and kind='text' and public.channel_access(id);
  select jsonb_build_object('id',id,'name',name) into hangout from public.channels where id=f.hangout_channel_id and community_id=cid and kind='voice' and public.channel_access(id,'connect');
 end if;
 return jsonb_build_object('id',cid,'slug',c.slug,'name',c.name,'description',c.description,'privacy',c.visibility,'cover',c.cover,
 'header_version',(select version::text from public.community_headers where community_id=cid),
 'leader',leader,'joined',r>0,'can_manage',r>=30,'owner',r=40,'featured',f.featured,
 'study_title',f.study_title,'passage_reference',f.passage_reference,'schedule_note',f.schedule_note,
 'members',case when r>0 then (select count(*) from public.community_members m where m.community_id=cid and m.status='active' and private.squad_live(m.user_id) and not private.squad_blocked(auth.uid(),m.user_id)) else null end,
 'discussion',discussion,'hangout',hangout);
end$$;
create function public.faith_circle_directory(p_mode text default 'explore',p_after uuid default null,p_size integer default 12) returns jsonb language plpgsql security definer set search_path='' as $$
declare items jsonb;begin
 if not private.squad_live(auth.uid()) then raise exception 'Unavailable' using errcode='42501';end if;
 if p_mode is null or p_mode not in ('explore','mine','featured') or p_size is null or p_size not between 1 and 24 then raise exception 'Invalid Circle query' using errcode='22023';end if;
 if not private.take_limit('faith-circle-read:'||auth.uid()::text,120,900) then return jsonb_build_object('limited',true);end if;
 select coalesce(jsonb_agg(private.faith_circle_card(q.community_id) order by q.community_id),'[]'::jsonb) into items from (
 select f.community_id from public.faith_circles f where (p_after is null or f.community_id>p_after) and private.faith_circle_allowed(f.community_id)
 and (p_mode<>'mine' or private.community_rank(f.community_id)>0) and (p_mode<>'featured' or (f.featured and f.study_title<>''))
 order by f.community_id limit p_size+1)q;
 return jsonb_build_object('items',items);
end$$;
create function public.faith_circle_get(p_community uuid) returns jsonb language plpgsql security definer set search_path='' as $$begin
 if not private.squad_live(auth.uid()) then raise exception 'Unavailable' using errcode='42501';end if;
 if not private.take_limit('faith-circle-read:'||auth.uid()::text,120,900) then return jsonb_build_object('limited',true);end if;
 return private.faith_circle_card(p_community);
end$$;
revoke all on function private.faith_circle_validate(),private.faith_circle_audit(),private.faith_leader_audit(),private.faith_circle_allowed(uuid),private.faith_circle_card(uuid) from public,anon,authenticated;
revoke all on function public.faith_circle_directory(text,uuid,integer),public.faith_circle_get(uuid) from public,anon,authenticated;
grant execute on function public.faith_circle_directory(text,uuid,integer),public.faith_circle_get(uuid) to authenticated;
create index events_circle_hangout_upcoming on public.events(community_id,voice_channel_id,starts_at) where status='scheduled';
create function public.faith_circle_events() returns jsonb language plpgsql security definer set search_path='' as $$
declare items jsonb;begin
 if not private.squad_live(auth.uid()) then raise exception 'Unavailable' using errcode='42501';end if;
 if not private.take_limit('faith-circle-read:'||auth.uid()::text,120,900) then return jsonb_build_object('limited',true);end if;
 with mine as (select f.community_id,f.hangout_channel_id from public.faith_circles f where private.faith_circle_allowed(f.community_id) and private.community_rank(f.community_id)>0 order by f.community_id limit 12),
 upcoming as (select e.id,e.title,e.starts_at,c.id circle_id,c.name circle_name from mine m join public.events e on e.community_id=m.community_id and e.voice_channel_id=m.hangout_channel_id join public.communities c on c.id=m.community_id join public.channels ch on ch.id=m.hangout_channel_id and ch.community_id=m.community_id and ch.kind='voice'
 where e.status='scheduled' and e.kind in ('voice','discussion') and e.starts_at>=now() and public.event_access(e.id) and public.channel_access(ch.id,'connect') order by e.starts_at,e.id limit 6)
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'starts_at',starts_at,'circleId',circle_id,'circleName',circle_name) order by starts_at,id),'[]'::jsonb) into items from upcoming;
 return jsonb_build_object('items',items);
end$$;
revoke all on function public.faith_circle_events() from public,anon,authenticated;
grant execute on function public.faith_circle_events() to authenticated;
notify pgrst,'reload schema';
