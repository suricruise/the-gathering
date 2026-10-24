-- Read-only workspace projections; preserve all existing tables, identities and chat RPCs.
create function public.channel_workspace_mentions(p_community uuid) returns table(channel_id uuid,mention_count bigint)
language plpgsql stable security definer set search_path='' as $$begin
 if not private.squad_live(auth.uid()) or private.community_rank(p_community)<10 then raise exception 'Unavailable' using errcode='42501';end if;
 return query select m.channel_id,count(*) from public.notifications n join public.messages m on m.id=n.resource_id
 join public.channels c on c.id=m.channel_id
 where n.recipient_id=auth.uid() and n.kind='mentions' and n.resource_type='channel' and n.read_at is null
 and c.community_id=p_community and m.deleted_at is null and public.channel_access(c.id) and public.notification_access(n.id)
 group by m.channel_id;
end$$;
create function public.channel_workspace_members(p_channel uuid,p_after uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare cid uuid;items jsonb;begin
 if not private.squad_live(auth.uid()) or not public.channel_access(p_channel) then raise exception 'Unavailable' using errcode='42501';end if;
 if not public.people_budget('search') then return jsonb_build_object('limited',true);end if;
 select community_id into cid from public.channels where id=p_channel;
 select coalesce(jsonb_agg(x.card order by x.user_id),'[]') into items from (
 select m.user_id,private.people_card(auth.uid(),m.user_id)||jsonb_build_object('role',m.role_id,'online',
 case when p.share_community_presence then to_jsonb(coalesce(p.community_last_seen>now()-interval '90 seconds',false))
 else private.people_card(auth.uid(),m.user_id)->'online' end) card
 from public.community_members m join public.member_privacy p on p.user_id=m.user_id
 where m.community_id=cid and m.status='active' and (p_after is null or m.user_id>p_after)
 and private.squad_live(m.user_id) and not private.squad_blocked(auth.uid(),m.user_id)
 order by m.user_id limit 31)x;
 return jsonb_build_object('items',items);
end$$;
revoke all on function public.channel_workspace_mentions(uuid),public.channel_workspace_members(uuid,uuid) from public,anon,authenticated;
grant execute on function public.channel_workspace_mentions(uuid),public.channel_workspace_members(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
