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
