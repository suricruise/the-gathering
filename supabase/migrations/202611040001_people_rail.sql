-- Community presence is a separate, explicit opt-in; friend-only status is unchanged.
alter table public.member_privacy add column share_community_presence boolean not null default false;
alter table public.member_privacy add column community_last_seen timestamptz;
create index member_community_presence on public.member_privacy(community_last_seen,user_id) where share_community_presence;
create function private.shared_member_community(a uuid,b uuid) returns uuid language sql stable security definer set search_path='' as $$
 select m.community_id from public.community_members m join public.community_members n on n.community_id=m.community_id
 join public.communities c on c.id=m.community_id
 where m.user_id=a and n.user_id=b and m.status='active' and n.status='active' and not c.archived
 order by m.community_id limit 1;
$$;
create function public.member_contact(p_target uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();cid uuid;begin
 if not private.squad_live(actor) or not private.squad_live(p_target) or private.squad_blocked(actor,p_target) then raise exception 'Member unavailable' using errcode='42501';end if;
 cid:=private.shared_member_community(actor,p_target);
 if actor<>p_target and cid is null and not private.people_friends(actor,p_target) and not private.people_visible(actor,p_target) then raise exception 'Member unavailable' using errcode='42501';end if;
 return private.people_card(actor,p_target)||jsonb_build_object('community',cid,'self',actor=p_target,'can_request',(select allow_requests from public.member_privacy where user_id=p_target),'can_message',private.dm_send_allowed(actor,p_target));
end$$;
create function public.online_member_rail(p_channel uuid default null,p_after uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();cid uuid;items jsonb;begin
 if not private.squad_live(actor) then raise exception 'Unavailable' using errcode='42501';end if;
 if p_channel is not null then
  if not public.channel_access(p_channel) then raise exception 'Unavailable' using errcode='42501';end if;
  select community_id into cid from public.channels where id=p_channel;
 end if;
 if not public.people_budget('search') then return jsonb_build_object('limited',true);end if;
 select coalesce(jsonb_agg(x.card order by x.user_id),'[]') into items from (
  select v.user_id,private.people_card(actor,v.user_id)||jsonb_build_object('online',true) card
  from public.member_privacy v
  where v.share_community_presence and v.community_last_seen>now()-interval '90 seconds' and v.user_id<>actor
  and (p_after is null or v.user_id>p_after) and private.squad_live(v.user_id) and not private.squad_blocked(actor,v.user_id)
  and not private.people_friends(actor,v.user_id)
  and (case when cid is null then private.shared_member_community(actor,v.user_id) is not null else exists(select 1 from public.community_members where community_id=cid and user_id=v.user_id and status='active') end)
  order by v.user_id limit 26
 )x;
 return jsonb_build_object('items',items);
end$$;
create function public.community_presence_preference(p_share boolean default null) returns jsonb language plpgsql security definer set search_path='' as $$begin
 if not private.squad_live(auth.uid()) then raise exception 'Unavailable' using errcode='42501';end if;
 if p_share is not null then
  if not public.people_budget('control') then return jsonb_build_object('limited',true);end if;
  update public.member_privacy set share_community_presence=p_share,community_last_seen=null where user_id=auth.uid();
 end if;
 return jsonb_build_object('share',(select share_community_presence from public.member_privacy where user_id=auth.uid()));
end$$;
create function public.community_presence_pulse() returns void language plpgsql security definer set search_path='' as $$begin
 if not private.squad_live(auth.uid()) then raise exception 'Unavailable' using errcode='42501';end if;
 if public.people_budget('heartbeat') then
  update public.member_privacy set community_last_seen=clock_timestamp() where user_id=auth.uid() and share_community_presence;
 end if;
end$$;
revoke all on function private.shared_member_community(uuid,uuid) from public,anon,authenticated;
revoke all on function public.member_contact(uuid),public.online_member_rail(uuid,uuid),public.community_presence_preference(boolean),public.community_presence_pulse() from public,anon,authenticated;
grant execute on function public.member_contact(uuid),public.online_member_rail(uuid,uuid),public.community_presence_preference(boolean),public.community_presence_pulse() to authenticated;
notify pgrst,'reload schema';

-- Keep the existing privacy payload stable for strict preference validation.
create or replace function public.people_home() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;begin
 result:=public.legacy_people_home();
 result:=jsonb_set(result,'{privacy}',(result->'privacy')-'community_last_seen'-'share_community_presence');
 if not exists(select 1 from public.notification_preferences where user_id=auth.uid() and friend_requests) then result:=result||jsonb_build_object('notifications','[]'::jsonb,'notification_unread',0);end if;
 return result||jsonb_build_object('all_notification_unread',(select count(*) from public.notifications where recipient_id=auth.uid() and read_at is null and public.notification_access(id)));
end $$;
