-- Review, back up and approve production changes before execution.
BEGIN;
SELECT pg_advisory_xact_lock(20261030);
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations(version text PRIMARY KEY,statements text[],name text);
REVOKE ALL ON SCHEMA supabase_migrations FROM public,anon,authenticated;
REVOKE ALL ON supabase_migrations.schema_migrations FROM public,anon,authenticated;
DO $preflight$ BEGIN
 IF to_regprocedure('public.community_manage(text,uuid,text,integer,text)') IS NULL THEN RAISE EXCEPTION 'Install community management first.'; END IF;
 IF (to_regprocedure('public.community_member_directory(uuid,uuid,text,uuid,text,boolean,integer)') IS NOT NULL OR to_regprocedure('public.community_member_action(uuid,uuid,text)') IS NOT NULL OR to_regprocedure('public.member_communities()') IS NOT NULL OR to_regclass('public.community_active_members_page') IS NOT NULL) AND NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='202611030001') THEN RAISE EXCEPTION 'Member directory objects exist without a migration record. Inspect history; no destructive reset was performed.'; END IF;
END $preflight$;
DO $install$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='202611030001') THEN
 EXECUTE $migration$
-- Social member lists are membership scoped, block-aware and bounded.
create index community_active_members_page on public.community_members(community_id,user_id) where status='active';
create function public.community_member_directory(p_community uuid default null,p_channel uuid default null,p_query text default '',p_after uuid default null,p_role text default 'all',p_online boolean default false,p_size integer default 30) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();cid uuid:=p_community;items jsonb;total integer;begin
 if not private.squad_live(actor) or num_nonnulls(p_community,p_channel)<>1 or p_query is null or length(p_query)>48 or p_query~'[[:cntrl:]]' or p_role not in ('all','owner','administrator','moderator','member') or p_role is null or p_online is null or p_size is null or p_size not between 1 and 50 then raise exception 'Unavailable' using errcode='42501';end if;
 if p_channel is not null then
  if not public.channel_access(p_channel) then raise exception 'Unavailable' using errcode='42501';end if;
  select community_id into cid from public.channels where id=p_channel;
 end if;
 if private.community_rank(cid)<10 then raise exception 'Unavailable' using errcode='42501';end if;
 if not public.people_budget('search') then return jsonb_build_object('limited',true);end if;
 select count(*) into total from public.community_members m join public.profiles p on p.id=m.user_id
 where m.community_id=cid and m.status='active' and private.squad_live(m.user_id) and not private.squad_blocked(actor,m.user_id)
 and (p_role='all' or m.role_id=p_role) and (btrim(p_query)='' or strpos(lower(p.display_name),lower(btrim(p_query)))>0 or starts_with(p.username,lower(ltrim(btrim(p_query),'@'))))
 and (not p_online or (private.people_card(actor,m.user_id)->>'online')::boolean is true);
 select coalesce(jsonb_agg(x.card order by x.user_id),'[]') into items from (
 select m.user_id,private.people_card(actor,m.user_id)||jsonb_build_object('role',m.role_id,'self',m.user_id=actor,
 'profile_visible',m.user_id=actor or p.visibility<>'private',
 'can_request',m.user_id<>actor and v.allow_requests,
 'can_message',m.user_id<>actor and private.dm_send_allowed(actor,m.user_id)) card
 from public.community_members m join public.profiles p on p.id=m.user_id join public.member_privacy v on v.user_id=m.user_id
 where m.community_id=cid and m.status='active' and private.squad_live(m.user_id) and not private.squad_blocked(actor,m.user_id)
 and (p_after is null or m.user_id>p_after) and (p_role='all' or m.role_id=p_role)
 and (btrim(p_query)='' or strpos(lower(p.display_name),lower(btrim(p_query)))>0 or starts_with(p.username,lower(ltrim(btrim(p_query),'@'))))
 and (not p_online or (private.people_card(actor,m.user_id)->>'online')::boolean is true)
 order by m.user_id limit p_size+1)x;
 return jsonb_build_object('community',(select jsonb_build_object('id',id,'name',name,'slug',slug) from public.communities where id=cid),'items',items,'total',total);
end$$;
create function public.community_member_action(p_community uuid,p_target uuid,p_operation text) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();f public.friendships;c public.conversations;label_value text;begin
 perform pg_advisory_xact_lock(20261030);
 perform private.people_pair(actor,p_target);
 if actor is null or p_target is null or actor=p_target or not private.squad_live(actor) or not private.squad_live(p_target) or private.community_rank(p_community)<10 or private.squad_blocked(actor,p_target) or not exists(select 1 from public.community_members where community_id=p_community and user_id=p_target and status='active') then raise exception 'Member unavailable' using errcode='42501';end if;
 if p_operation not in ('request','open','block') or p_operation is null then raise exception 'Invalid operation' using errcode='22023';end if;
 if not public.people_budget(case when p_operation='request' then 'request' else 'control' end) then return jsonb_build_object('limited',true);end if;
 select * into f from public.friendships where low_id=least(actor,p_target) and high_id=greatest(actor,p_target);
 if p_operation='request' then
  if not exists(select 1 from public.member_privacy where user_id=p_target and allow_requests) then raise exception 'Member unavailable' using errcode='42501';end if;
  if f.status is not null then return jsonb_build_object('ok',true);end if;
  if (select count(*) from public.friendships where actor in (low_id,high_id))>=500 or (select count(*) from public.friendships where p_target in (low_id,high_id))>=500 then raise exception 'Friend list full' using errcode='54000';end if;
  insert into public.friendships(low_id,high_id,requested_by) values(least(actor,p_target),greatest(actor,p_target),actor);
  insert into public.member_notifications(user_id,actor_id,kind) values(p_target,actor,'friend_request');
 elsif p_operation='open' then
  if not private.dm_send_allowed(actor,p_target) then raise exception 'Messaging unavailable' using errcode='42501';end if;
  if (select count(*) from public.conversations where actor in (low_id,high_id))>=500 and not exists(select 1 from public.conversations where low_id=least(actor,p_target) and high_id=greatest(actor,p_target)) then raise exception 'Conversation limit' using errcode='54000';end if;
  insert into public.conversations(low_id,high_id) values(least(actor,p_target),greatest(actor,p_target)) on conflict(low_id,high_id) do update set low_id=excluded.low_id returning * into c;
  return jsonb_build_object('id',c.id);
 else
  if (select count(*) from public.member_blocks where blocker_id=actor)>=100 then raise exception 'Block list full' using errcode='54000';end if;
  select display_name into label_value from public.profiles where id=p_target;
  insert into public.member_blocks(blocker_id,blocked_id,label) values(actor,p_target,left(coalesce(label_value,'Member'),80)) on conflict do nothing;
 end if;
 perform realtime.send('{}'::jsonb,'changed','people:'||actor::text,true);
 perform realtime.send('{}'::jsonb,'changed','people:'||p_target::text,true);
 return jsonb_build_object('ok',true);
end$$;
-- Preserve staff's moderation roster, while normal roster calls respect blocks too.
create or replace function public.community_roster(p_community uuid)
returns table(user_id uuid,username text,display_name text,role_id text,status text)
language sql stable security definer set search_path='' as $$
 select m.user_id,p.username,p.display_name,m.role_id,m.status from public.community_members m join public.profiles p on p.id=m.user_id
 where m.community_id=p_community and private.community_rank(p_community)>0
 and (private.community_rank(p_community)>=20 or (m.status='active' and not private.squad_blocked(auth.uid(),m.user_id)))
 order by m.joined_at,m.user_id limit 500;
$$;
revoke all on function public.community_member_directory(uuid,uuid,text,uuid,text,boolean,integer),public.community_member_action(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.community_member_directory(uuid,uuid,text,uuid,text,boolean,integer),public.community_member_action(uuid,uuid,text) to authenticated;
notify pgrst,'reload schema';

create function public.member_communities() returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if not private.squad_live(auth.uid()) then raise exception 'Not authorized' using errcode='42501';end if;
 return coalesce((select jsonb_agg(x order by x.display_order,x.name,x.id) from (select c.id,c.name,c.slug,c.display_order from public.community_members m join public.communities c on c.id=m.community_id where m.user_id=auth.uid() and m.status='active' and not c.archived order by c.display_order,c.name,c.id limit 200)x),'[]');
end$$;
revoke all on function public.member_communities() from public,anon,authenticated;
grant execute on function public.member_communities() to authenticated;
notify pgrst,'reload schema';

$migration$;
 INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES('202611030001','member_directory');
 ELSE RAISE NOTICE 'Member directory already recorded; skipped.'; END IF;
END $install$;
COMMIT;
