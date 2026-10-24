-- Include offline and hidden-status members without weakening membership or presence privacy.
create function public.community_people_rail(p_channel uuid default null,p_after uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();cid uuid;items jsonb;begin
 if not private.squad_live(actor) then raise exception 'Unavailable' using errcode='42501';end if;
 if p_channel is not null then
  if not public.channel_access(p_channel) then raise exception 'Unavailable' using errcode='42501';end if;
  select community_id into cid from public.channels where id=p_channel;
 end if;
 if not public.people_budget('search') then return jsonb_build_object('limited',true);end if;
 select coalesce(jsonb_agg(x.card order by x.user_id),'[]') into items from (
  select p.user_id,private.people_card(actor,p.user_id)||jsonb_build_object('online',
   case when p.share_community_presence then coalesce(p.community_last_seen>now()-interval '90 seconds',false) else null end) card
  from public.member_privacy p
  where (p_after is null or p.user_id>p_after) and private.squad_live(p.user_id) and not private.squad_blocked(actor,p.user_id)
  and not private.people_friends(actor,p.user_id)
  and (case when cid is null then private.shared_member_community(actor,p.user_id) is not null else exists(select 1 from public.community_members where community_id=cid and user_id=p.user_id and status='active') end)
  order by p.user_id limit 26
 )x;
 return jsonb_build_object('items',items);
end$$;
revoke all on function public.community_people_rail(uuid,uuid) from public,anon,authenticated;
grant execute on function public.community_people_rail(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
