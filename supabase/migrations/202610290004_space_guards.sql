-- Phase 10 permission hardening and scoped moderator recipient projection.
create or replace function public.space_read(p_view text,p_resource uuid default null,p_community uuid default null,p_before bigint default null,p_filter text default 'all') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.prayer_requests;e public.events;result jsonb;begin
 if not private.squad_live(auth.uid()) then raise exception 'Not authorized' using errcode='42501';end if;
 if p_before is not null and p_before<1 then raise exception 'Invalid cursor' using errcode='22023';end if;
 if p_view='context' then return jsonb_build_object(
  'communities',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'rank',private.space_rank(auth.uid(),id)) order by name) from public.communities where private.space_rank(auth.uid(),id)>0),'[]'),
  'channels',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'community_id',community_id)) from public.channels where kind='voice' and public.channel_access(id,'connect')),'[]'),
  'sessions',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',title,'community_id',community_id)) from public.gaming_sessions where host_id=auth.uid() and status='open' and expires_at>now()),'[]'),
  'preferences',(select to_jsonb(v)-'user_id' from public.notification_preferences v where user_id=auth.uid()));
 elsif p_view='prayers' then
  if private.space_rank(auth.uid(),p_community)=0 then raise exception 'Community unavailable' using errcode='42501';end if;
  select coalesce(jsonb_agg(private.prayer_dto(q) order by q.seq desc),'[]') into result from(select * from public.prayer_requests where community_id=p_community and public.prayer_access(id) and (p_before is null or seq<p_before) order by seq desc limit 20)q;return jsonb_build_object('items',result);
 elsif p_view='prayer' then
  if not public.prayer_access(p_resource) then raise exception 'Request unavailable' using errcode='42501';end if;
  select * into p from public.prayer_requests where id=p_resource;
  return jsonb_build_object('prayer',private.prayer_dto(p),'comments',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('seq',c.seq::text,'author_name',(select display_name from public.profiles where id=c.author_id),'can_remove',c.author_id=auth.uid() or private.space_rank(auth.uid(),p.community_id)>=20) order by c.seq) from(select * from public.prayer_comments where prayer_id=p.id and not private.squad_blocked(auth.uid(),author_id) and (p_before is null or seq<p_before) order by seq desc limit 40)c),'[]'));
 elsif p_view='events' then
  if p_filter not in ('all','gaming','voice','discussion') then raise exception 'Invalid filter' using errcode='22023';end if;
  select coalesce(jsonb_agg(private.event_dto(q) order by q.seq desc),'[]') into result from(select * from public.events where public.event_access(id) and (p_community is null or community_id=p_community) and (p_filter='all' or kind=p_filter) and (p_before is null or seq<p_before) order by seq desc limit 20)q;return jsonb_build_object('items',result);
 elsif p_view='event' then
  if not public.event_access(p_resource) then raise exception 'Event unavailable' using errcode='42501';end if;select * into e from public.events where id=p_resource;return private.event_dto(e);
 elsif p_view='notifications' then
  select coalesce(jsonb_agg(jsonb_build_object('id',n.id::text,'kind',n.kind,'resource_type',n.resource_type,'resource_id',n.resource_id,'read',n.read_at is not null,'created_at',n.created_at,'href',case n.resource_type when 'friend' then '/messages?tab=friends' when 'prayer' then '/faith/'||n.resource_id::text when 'event' then '/events/'||n.resource_id::text when 'post' then '/feed/'||n.resource_id::text when 'channel' then (select '/channels/'||channel_id::text||'?message='||n.resource_id::text from public.messages where id=n.resource_id) else '/notifications' end) order by n.id desc),'[]') into result from(select * from public.notifications where recipient_id=auth.uid() and public.notification_access(id) and (p_before is null or id<p_before) order by id desc limit 30)n;return jsonb_build_object('items',result,'unread',(select count(*) from public.notifications where recipient_id=auth.uid() and read_at is null and public.notification_access(id)),'preferences',(select to_jsonb(v)-'user_id' from public.notification_preferences v where user_id=auth.uid()));
 elsif p_view='recipients' then
  if private.space_rank(auth.uid(),p_community)<20 then raise exception 'Not authorized' using errcode='42501';end if;
  return jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'name',q.display_name)) from(select prof.id,prof.display_name from public.profiles prof join public.community_members m on m.user_id=prof.id where m.community_id=p_community and m.status='active' and prof.id<>auth.uid() and private.squad_live(prof.id) and not private.squad_blocked(auth.uid(),prof.id) order by prof.display_name,prof.id limit 1000)q),'[]'));
 elsif p_view='notice' then
  if not private.notification_resource(auth.uid(),'notice',p_resource) then raise exception 'Notice unavailable' using errcode='42501';end if;return (select jsonb_build_object('id',id,'body',body,'created_at',created_at) from public.moderator_notices where id=p_resource);
 else raise exception 'Invalid view' using errcode='22023';end if;
end $$;

create function private.targeted_invitation_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.accepted_by is not null and old.accepted_by is null and exists(select 1 from public.community_notification_invitations where invitation_id=new.id and (recipient_id<>new.accepted_by or status<>'pending')) then raise exception 'Invitation unavailable' using errcode='42501';end if;return new;end $$;
create trigger targeted_invitation_guard before update on public.invitations for each row execute function private.targeted_invitation_guard();
create function private.spaces_on_block() returns trigger language plpgsql security definer set search_path='' as $$begin
 update public.community_notification_invitations set status='declined' where status='pending' and ((sender_id=new.blocker_id and recipient_id=new.blocked_id) or (sender_id=new.blocked_id and recipient_id=new.blocker_id));
 update public.gaming_session_invitations set status='declined' where status='pending' and ((sender_id=new.blocker_id and recipient_id=new.blocked_id) or (sender_id=new.blocked_id and recipient_id=new.blocker_id));return new;end $$;
create trigger spaces_on_block after insert on public.member_blocks for each row execute function private.spaces_on_block();
revoke all on function private.targeted_invitation_guard(),private.spaces_on_block() from public,anon,authenticated;
create or replace function public.deliver_event_reminders(p_limit integer default 500) returns jsonb language plpgsql security definer set search_path='' as $$
declare r record;d text;scanned integer:=0;delivered integer:=0;existed boolean;begin
 if p_limit is null or p_limit not between 1 and 5000 then raise exception 'Invalid limit' using errcode='22023';end if;
 perform pg_advisory_xact_lock(20261029);
 for r in select e.id,e.host_id,e.revision,v.user_id from public.events e join public.event_rsvps v on v.event_id=e.id and v.response='going' join public.notification_preferences n on n.user_id=v.user_id and n.event_reminders join public.user_preferences p on p.user_id=v.user_id and p.event_reminders
 where e.status='scheduled' and e.starts_at>clock_timestamp() and e.starts_at<=clock_timestamp()+interval '1 hour' and private.event_allowed(v.user_id,e.id)
 and not exists(select 1 from public.notifications where dedupe_key='reminder:'||e.id::text||':'||e.revision::text||':'||v.user_id::text)
 order by e.starts_at,e.id,v.user_id limit p_limit loop
  scanned:=scanned+1;d:='reminder:'||r.id::text||':'||r.revision::text||':'||r.user_id::text;
  perform private.emit_notification(r.user_id,null,'event_reminders','event',r.id,d);
  if exists(select 1 from public.notifications where dedupe_key=d) then delivered:=delivered+1;end if;
 end loop;
 return jsonb_build_object('scanned',scanned,'delivered',delivered);
end $$;

create function private.sync_event_reminder_preference() returns trigger language plpgsql security definer set search_path='' as $$begin
 update public.notification_preferences set event_reminders=new.event_reminders where user_id=new.user_id and event_reminders is distinct from new.event_reminders;return new;end $$;
create trigger sync_event_reminder_preference after update of event_reminders on public.user_preferences for each row execute function private.sync_event_reminder_preference();
revoke all on function private.sync_event_reminder_preference() from public,anon,authenticated;
notify pgrst,'reload schema';
