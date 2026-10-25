-- Additive read projections and private summary invalidations. Existing messages/providers stay.
create function public.chat_state(p_channel uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$begin
 if not coalesce(public.channel_access(p_channel),false) then raise exception 'Channel unavailable' using errcode='42501';end if;
 return jsonb_build_object('watermark',coalesce((select max(version) from public.messages where channel_id=p_channel),0)::text,
 'last_read_seq',coalesce((select last_read_seq from public.read_receipts where channel_id=p_channel and user_id=auth.uid()),0)::text,
 'unread_count',(select count(*) from public.messages m where m.channel_id=p_channel and m.deleted_at is null and m.author_id is distinct from auth.uid() and m.created_seq>coalesce((select last_read_seq from public.read_receipts where channel_id=p_channel and user_id=auth.uid()),0)));
end$$;
create function public.chat_conversation_page(p_channel uuid,p_mode text default 'initial',p_cursor bigint default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare anchor bigint;forward boolean;items jsonb;lo bigint;hi bigint;first_unread uuid;state jsonb;
begin
 if not coalesce(public.channel_access(p_channel),false) or not exists(select 1 from public.channels where id=p_channel and kind='text') then raise exception 'Channel unavailable' using errcode='42501';end if;
 if p_mode is null or p_mode not in ('initial','latest','before','after') or (p_mode in ('before','after') and (p_cursor is null or p_cursor<0)) then raise exception 'Invalid page' using errcode='22023';end if;
 select m.id,m.created_seq into first_unread,anchor from public.messages m where m.channel_id=p_channel and m.parent_id is null and m.deleted_at is null and m.author_id is distinct from auth.uid()
 and m.created_seq>coalesce((select last_read_seq from public.read_receipts where channel_id=p_channel and user_id=auth.uid()),0) order by m.created_seq limit 1;
 forward:=p_mode='after' or (p_mode='initial' and anchor is not null);
 if forward then
  select coalesce(jsonb_agg(private.chat_message_dto(x) order by x.created_seq),'[]'),min(x.created_seq),max(x.created_seq) into items,lo,hi from (
   select m.* from public.messages m where m.channel_id=p_channel and m.parent_id is null and (case when p_mode='after' then m.created_seq>p_cursor else m.created_seq>=anchor end) order by m.created_seq limit 40)x;
 else
  select coalesce(jsonb_agg(private.chat_message_dto(x) order by x.created_seq),'[]'),min(x.created_seq),max(x.created_seq) into items,lo,hi from (
   select m.* from public.messages m where m.channel_id=p_channel and m.parent_id is null and (p_mode<>'before' or m.created_seq<p_cursor) order by m.created_seq desc limit 40)x;
 end if;
 state:=public.chat_state(p_channel);
 return state||jsonb_build_object('messages',items,'first_unread_id',first_unread,
 'has_older',exists(select 1 from public.messages where channel_id=p_channel and parent_id is null and created_seq<lo),
 'has_newer',exists(select 1 from public.messages where channel_id=p_channel and parent_id is null and created_seq>hi),
 'latest_seq',coalesce((select max(created_seq) from public.messages where channel_id=p_channel and parent_id is null),0)::text);
end$$;
create function public.chat_receipt_snapshot(p_channel uuid,p_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$begin
 if not coalesce(public.channel_access(p_channel),false) then raise exception 'Channel unavailable' using errcode='42501';end if;
 if p_ids is null or cardinality(p_ids)>100 then raise exception 'Invalid batch' using errcode='22023';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'read_count',(select count(*) from public.read_receipts r where r.channel_id=p_channel and r.user_id is distinct from m.author_id and r.last_read_seq>=m.created_seq))) from public.messages m where m.channel_id=p_channel and m.id=any(p_ids)),'[]'::jsonb);
end$$;
create function public.chat_mark_all_read(p_channel uuid) returns jsonb
language plpgsql security definer set search_path='' as $$declare latest uuid;begin
 perform private.chat_require(p_channel);
 select id into latest from public.messages where channel_id=p_channel order by created_seq desc limit 1;
 if latest is not null then perform public.mark_channel_read(p_channel,latest);end if;
 return public.chat_state(p_channel);
end$$;
create or replace function public.channel_workspace_mentions(p_community uuid) returns table(channel_id uuid,mention_count bigint)
language plpgsql stable security definer set search_path='' as $$begin
 if not private.squad_live(auth.uid()) or private.community_rank(p_community)<10 then raise exception 'Unavailable' using errcode='42501';end if;
 return query select m.channel_id,count(*) from public.notifications n join public.messages m on m.id=n.resource_id
 join public.channels c on c.id=m.channel_id
 where n.recipient_id=auth.uid() and n.kind='mentions' and n.resource_type='channel' and n.read_at is null
 and m.created_seq>coalesce((select r.last_read_seq from public.read_receipts r where r.channel_id=m.channel_id and r.user_id=auth.uid()),0)
 and c.community_id=p_community and m.deleted_at is null and public.channel_access(c.id) and public.notification_access(n.id)
 group by m.channel_id;
end$$;
create function public.chat_community_state(p_community uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$begin
 if not private.squad_live(auth.uid()) or private.community_rank(p_community)<10 then raise exception 'Unavailable' using errcode='42501';end if;
 return jsonb_build_object('unread',coalesce((select jsonb_agg(x) from public.channel_unread_counts(p_community)x),'[]'),'mentions',coalesce((select jsonb_agg(x) from public.channel_workspace_mentions(p_community)x),'[]'));
end$$;
create function private.chat_summary_changed() returns trigger
language plpgsql security definer set search_path='' as $$declare recipient uuid;begin
 if tg_table_name='read_receipts' then
  perform realtime.send('{}','chat_summary','people:'||new.user_id::text,true);
 elsif tg_op='INSERT' or new.deleted_at is distinct from old.deleted_at then
  for recipient in select m.user_id from public.community_members m join public.channels c on c.community_id=m.community_id
   where c.id=new.channel_id and m.status='active' and m.user_id is distinct from new.author_id and private.channel_user_allowed(m.user_id,new.channel_id)
  loop perform realtime.send('{}','chat_summary','people:'||recipient::text,true);end loop;
 end if;
 return new;
end$$;
create trigger chat_summary_message after insert or update of deleted_at on public.messages for each row execute function private.chat_summary_changed();
create trigger chat_summary_receipt after insert or update on public.read_receipts for each row execute function private.chat_summary_changed();
revoke all on function public.channel_workspace_mentions(uuid),public.chat_state(uuid),public.chat_conversation_page(uuid,text,bigint),public.chat_receipt_snapshot(uuid,uuid[]),public.chat_mark_all_read(uuid),public.chat_community_state(uuid),private.chat_summary_changed() from public,anon,authenticated;
grant execute on function public.channel_workspace_mentions(uuid),public.chat_state(uuid),public.chat_conversation_page(uuid,text,bigint),public.chat_receipt_snapshot(uuid,uuid[]),public.chat_mark_all_read(uuid),public.chat_community_state(uuid) to authenticated;
notify pgrst,'reload schema';
