create function public.space_budget(p_operation text) returns boolean language plpgsql security definer set search_path='' as $$
declare n integer;lim integer;begin
 if not private.squad_live(auth.uid()) or p_operation not in ('request','prayer','comment','event','invite','notice','control') then return false;end if;
 lim:=case p_operation when 'request' then 120 when 'prayer' then 5 when 'comment' then 20 when 'event' then 5 when 'invite' then 10 when 'notice' then 10 else 60 end;
 insert into private.space_budgets(user_id,operation,attempts) values(auth.uid(),p_operation,1) on conflict(user_id,operation) do update set attempts=case when private.space_budgets.started_at<clock_timestamp()-interval '1 minute' then 1 else private.space_budgets.attempts+1 end,started_at=case when private.space_budgets.started_at<clock_timestamp()-interval '1 minute' then clock_timestamp() else private.space_budgets.started_at end returning attempts into n;return n<=lim;
end $$;
create function private.space_text(t text,max_length integer) returns boolean language sql immutable set search_path='' as $$select t is not null and length(btrim(t)) between 1 and max_length and t !~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]';$$;
create function private.prayer_dto(p public.prayer_requests) returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(p)||jsonb_build_object('seq',p.seq::text,'author_name',(select display_name from public.profiles where id=p.author_id),'can_manage',auth.uid()=p.author_id or private.space_rank(auth.uid(),p.community_id)>=20,'moderator',private.space_rank(auth.uid(),p.community_id)>=20,'encouraged',exists(select 1 from public.prayer_encouragements where prayer_id=p.id and user_id=auth.uid()),'encouragements',(select count(*) from public.prayer_encouragements where prayer_id=p.id and not private.squad_blocked(auth.uid(),user_id)));
$$;
create function private.event_dto(e public.events) returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(e)||jsonb_build_object('seq',e.seq::text,'community_name',(select name from public.communities where id=e.community_id),'host_name',(select display_name from public.profiles where id=e.host_id),'can_manage',e.host_id=auth.uid() or private.space_rank(auth.uid(),e.community_id)>=20,
 'gaming_session_id',case when public.squad_access(e.gaming_session_id) then e.gaming_session_id else null end,'voice_channel_id',case when public.channel_access(e.voice_channel_id,'connect') then e.voice_channel_id else null end,
 'going',(select count(*) from public.event_rsvps where event_id=e.id and response='going' and private.space_rank(user_id,e.community_id)>0 and not private.squad_blocked(auth.uid(),user_id)),
 'my_rsvp',(select response from public.event_rsvps where event_id=e.id and user_id=auth.uid()),'state',case when e.status='cancelled' then 'cancelled' when e.ends_at<=now() then 'ended' when e.starts_at<=now() then 'live' else 'upcoming' end);
$$;
create function public.space_read(p_view text,p_resource uuid default null,p_community uuid default null,p_before bigint default null,p_filter text default 'all') returns jsonb language plpgsql stable security definer set search_path='' as $$
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
 elsif p_view='notice' then
  if not private.notification_resource(auth.uid(),'notice',p_resource) then raise exception 'Notice unavailable' using errcode='42501';end if;return (select jsonb_build_object('id',id,'body',body,'created_at',created_at) from public.moderator_notices where id=p_resource);
 else raise exception 'Invalid view' using errcode='22023';end if;
end $$;

create function public.space_command(p_operation text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();target uuid;cid uuid;item uuid;p public.prayer_requests;e public.events;g public.gaming_sessions;ci public.community_notification_invitations;gi public.gaming_session_invitations;t text;kind_value text;starts timestamptz;ends timestamptz;tz text;old_revision integer;pref jsonb;field text;member_row record;begin
 if not private.squad_live(actor) then raise exception 'Not authorized' using errcode='42501';end if;
 if not public.space_budget(case when p_operation='prayer-create' then 'prayer' when p_operation='prayer-comment' then 'comment' when p_operation='event-create' then 'event' when p_operation in ('invite-community','invite-squad') then 'invite' when p_operation='notice-create' then 'notice' else 'control' end) then return jsonb_build_object('limited',true);end if;
 if p_operation='preferences' then
  foreach field in array array['friend_requests','replies','mentions','community_invitations','event_reminders','event_updates','gaming_invitations','moderator_notices','daily_content'] loop if jsonb_typeof(p_data->field) is distinct from 'boolean' then raise exception 'Invalid preferences' using errcode='22023';end if;end loop;
  update public.notification_preferences set friend_requests=(p_data->>'friend_requests')::boolean,replies=(p_data->>'replies')::boolean,mentions=(p_data->>'mentions')::boolean,community_invitations=(p_data->>'community_invitations')::boolean,event_reminders=(p_data->>'event_reminders')::boolean,event_updates=(p_data->>'event_updates')::boolean,gaming_invitations=(p_data->>'gaming_invitations')::boolean,moderator_notices=(p_data->>'moderator_notices')::boolean,daily_content=(p_data->>'daily_content')::boolean where user_id=actor;
  update public.user_preferences set event_reminders=(p_data->>'event_reminders')::boolean where user_id=actor;
  return jsonb_build_object('ok',true);
 elsif p_operation='notifications-read' then
  update public.notifications set read_at=now() where recipient_id=actor and read_at is null and (p_data->>'id' is null or id=(p_data->>'id')::bigint);
  if p_data->>'id' is null then update public.member_notifications set read_at=now() where user_id=actor and read_at is null;end if;return jsonb_build_object('ok',true);
 elsif p_operation in ('accept-community','decline-community') then
  select * into ci from public.community_notification_invitations where id=(p_data->>'id')::uuid and recipient_id=actor;
  if not found or not private.notification_resource(actor,'community_invite',ci.id) then raise exception 'Invitation unavailable' using errcode='42501';end if;
  -- Original community command owns lock ordering, live roles, membership, bans and block enforcement.
  if p_operation='accept-community' then select token into t from private.community_delivery_tokens where invitation_id=ci.invitation_id;perform public.community_command('accept_invite',ci.community_id,jsonb_build_object('token',t));end if;
  update public.community_notification_invitations set status=case when p_operation='accept-community' then 'accepted' else 'declined' end where id=ci.id;
  return jsonb_build_object('href','/communities/'||(select slug from public.communities where id=ci.community_id));
 elsif p_operation in ('accept-squad','decline-squad') then
  select * into gi from public.gaming_session_invitations where id=(p_data->>'id')::uuid and recipient_id=actor;
  if not found or not private.notification_resource(actor,'squad_invite',gi.id) then raise exception 'Invitation unavailable' using errcode='42501';end if;
  update public.gaming_session_invitations set status=case when p_operation='accept-squad' then 'accepted' else 'declined' end where id=gi.id;
  return jsonb_build_object('href','/squad-up/'||gi.session_id::text);
 elsif p_operation in ('invite-community','invite-squad','notice-create') then
  cid:=(p_data->>'community')::uuid;target:=(p_data->>'target')::uuid;
  if p_operation='invite-squad' then select * into g from public.gaming_sessions where id=(p_data->>'session')::uuid;cid:=g.community_id;if g.host_id is distinct from actor or g.status<>'open' or g.expires_at<=now() or not private.squad_eligible(target,g) then raise exception 'Invitation unavailable' using errcode='42501';end if;
  else
   perform 1 from public.communities where id=cid for update;
   if private.space_rank(actor,cid)<20 then raise exception 'Not authorized' using errcode='42501';end if;
  end if;
  perform private.people_pair(actor,target);
  if actor=target or not private.squad_live(target) or private.squad_blocked(actor,target) then raise exception 'Member unavailable' using errcode='42501';end if;
  kind_value:=case p_operation when 'invite-community' then 'community_invitations' when 'invite-squad' then 'gaming_invitations' else 'moderator_notices' end;
  if not exists(select 1 from public.notification_preferences where user_id=target and (to_jsonb(notification_preferences)->>kind_value)::boolean) then raise exception 'Contact unavailable' using errcode='42501';end if;
  if p_operation='notice-create' then
   if private.space_rank(target,cid)=0 or not private.space_text(p_data->>'body',2000) then raise exception 'Notice unavailable' using errcode='42501';end if;
   item:=(p_data->>'id')::uuid;insert into public.moderator_notices(id,community_id,sender_id,recipient_id,body) values(item,cid,actor,target,p_data->>'body') on conflict do nothing;
   if not exists(select 1 from public.moderator_notices where id=item and sender_id=actor and recipient_id=target) then raise exception 'Notice unavailable' using errcode='42501';end if;
   perform private.emit_notification(target,actor,kind_value,'notice',item,'notice:'||item::text);
  else
   if not private.people_friends(actor,target) then raise exception 'Invitation unavailable' using errcode='42501';end if;
   if p_operation='invite-community' then
    if exists(select 1 from public.community_members where community_id=cid and user_id=target) then raise exception 'Invitation unavailable' using errcode='42501';end if;
    delete from public.community_notification_invitations where community_id=cid and recipient_id=target and status='pending' and expires_at<=now();
    select id into item from public.community_notification_invitations where community_id=cid and recipient_id=target and status='pending';
    if item is null then
     t:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
     insert into public.invitations(community_id,invited_by,token_digest,expires_at) values(cid,actor,encode(sha256(convert_to(t,'UTF8')),'hex'),now()+interval '7 days') returning id into item;
     insert into private.community_delivery_tokens(invitation_id,token) values(item,t);
     insert into public.community_notification_invitations(community_id,sender_id,recipient_id,invitation_id) values(cid,actor,target,item) returning id into item;
    end if;
    perform private.emit_notification(target,actor,kind_value,'community_invite',item,'community-invite:'||item::text);
   else
    delete from public.gaming_session_invitations where session_id=g.id and recipient_id=target and status='pending' and expires_at<=now();
    insert into public.gaming_session_invitations(session_id,sender_id,recipient_id) values(g.id,actor,target) on conflict(session_id,recipient_id) where status='pending' do update set sender_id=excluded.sender_id returning id into item;
    perform private.emit_notification(target,actor,kind_value,'squad_invite',item,'squad-invite:'||item::text);
   end if;
  end if;
  return jsonb_build_object('ok',true);
 elsif p_operation='prayer-create' then
  cid:=(p_data->>'community')::uuid;item:=(p_data->>'id')::uuid;
  if private.space_rank(actor,cid)=0 then raise exception 'Not authorized' using errcode='42501';end if;
  if p_data->>'guidelines' is distinct from 'true' or not private.space_text(p_data->>'body',4000) or coalesce(p_data->>'visibility','') not in ('community','moderators') then raise exception 'Invalid request' using errcode='22023';end if;
  insert into public.prayer_requests(id,community_id,author_id,body,visibility) values(item,cid,actor,p_data->>'body',p_data->>'visibility') on conflict do nothing;
  if not exists(select 1 from public.prayer_requests where id=item and author_id=actor and community_id=cid) then raise exception 'Invalid request' using errcode='42501';end if;return jsonb_build_object('id',item);
 elsif p_operation like 'prayer-%' then
  select * into p from public.prayer_requests where id=(p_data->>'prayer')::uuid for update;
  if not found or not public.prayer_access(p.id) then raise exception 'Request unavailable' using errcode='42501';end if;
  if p_operation='prayer-comment' then
   if p.status not in ('open','answered') or not private.space_text(p_data->>'body',2000) then raise exception 'Invalid encouragement' using errcode='22023';end if;
   item:=(p_data->>'id')::uuid;insert into public.prayer_comments(id,prayer_id,author_id,body) values(item,p.id,actor,p_data->>'body') on conflict do nothing;
   if not exists(select 1 from public.prayer_comments where id=item and author_id=actor and prayer_id=p.id) then raise exception 'Invalid encouragement' using errcode='42501';end if;
  elsif p_operation='prayer-encourage' then
   if p.status not in ('open','answered') then raise exception 'Request unavailable' using errcode='42501';end if;
   if (p_data->>'enabled')::boolean then insert into public.prayer_encouragements values(p.id,actor) on conflict do nothing;else delete from public.prayer_encouragements where prayer_id=p.id and user_id=actor;end if;
  elsif p_operation='prayer-comment-remove' then
   delete from public.prayer_comments where id=(p_data->>'comment')::uuid and prayer_id=p.id and (author_id=actor or private.space_rank(actor,p.community_id)>=20);
   if not found then raise exception 'Not authorized' using errcode='42501';end if;
  else
   if p.author_id<>actor and private.space_rank(actor,p.community_id)<20 then raise exception 'Not authorized' using errcode='42501';end if;
   if p_operation='prayer-edit' then
    if actor<>p.author_id or p.status in ('hidden','removed') or not private.space_text(p_data->>'body',4000) or coalesce(p_data->>'visibility','') not in ('community','moderators') then raise exception 'Not authorized' using errcode='42501';end if;
    update public.prayer_requests set body=p_data->>'body',visibility=p_data->>'visibility',updated_at=now() where id=p.id;
   elsif p_operation='prayer-status' then
    t:=p_data->>'status';
    if t not in ('open','answered','hidden','removed') or (t='hidden' and private.space_rank(actor,p.community_id)<20) or (p.status='hidden' and private.space_rank(actor,p.community_id)<20) or (p.status='removed' and t<>'removed') then raise exception 'Not authorized' using errcode='42501';end if;
    if actor<>p.author_id and not private.space_text(p_data->>'reason',300) then raise exception 'Reason required' using errcode='22023';end if;
    update public.prayer_requests set status=t,body=case when t='removed' then '' else body end,updated_at=now() where id=p.id;
    if t='removed' then delete from public.prayer_comments where prayer_id=p.id;end if;
    insert into private.space_audit(community_id,actor_id,resource_id,action,reason) values(p.community_id,actor,p.id,'prayer-'||t,coalesce(p_data->>'reason',''));
   else raise exception 'Invalid operation' using errcode='22023';end if;
  end if;return jsonb_build_object('ok',true);
 elsif p_operation in ('event-create','event-update','event-cancel','rsvp') then
  item:=(p_data->>'id')::uuid;
  if p_operation='event-create' then cid:=(p_data->>'community')::uuid;if private.space_rank(actor,cid)=0 then raise exception 'Not authorized' using errcode='42501';end if;
  else select * into e from public.events where id=item for update;if not found or not public.event_access(e.id) then raise exception 'Event unavailable' using errcode='42501';end if;cid:=e.community_id;end if;
  if p_operation='rsvp' then
   if e.status<>'scheduled' or e.ends_at<=clock_timestamp() then raise exception 'Event has ended' using errcode='55000';end if;
   if coalesce(p_data->>'response','') not in ('going','interested','declined','withdraw') then raise exception 'Invalid RSVP' using errcode='22023';end if;
   if p_data->>'response'='withdraw' then delete from public.event_rsvps where event_id=item and user_id=actor;
   else insert into public.event_rsvps(event_id,user_id,response) values(item,actor,p_data->>'response') on conflict(event_id,user_id) do update set response=excluded.response,updated_at=now();end if;return jsonb_build_object('ok',true);
  end if;
  if p_operation<>'event-create' and e.host_id<>actor and private.space_rank(actor,cid)<20 then raise exception 'Not authorized' using errcode='42501';end if;
  if p_operation='event-cancel' then if e.status='cancelled' then return jsonb_build_object('ok',true);end if;update public.events set status='cancelled',revision=revision+1,updated_at=now() where id=item;
  else
   if p_operation='event-update' and (e.status<>'scheduled' or e.ends_at<=now()) then raise exception 'Event has ended' using errcode='55000';end if;
   tz:=p_data->>'time_zone';if not exists(select 1 from pg_catalog.pg_timezone_names where name=tz) then raise exception 'Invalid time zone' using errcode='22023';end if;
   starts:=(p_data->>'starts_local')::timestamp at time zone tz;ends:=(p_data->>'ends_local')::timestamp at time zone tz;
   if starts is null or ends is null or (starts at time zone tz)<>(p_data->>'starts_local')::timestamp or (ends at time zone tz)<>(p_data->>'ends_local')::timestamp or starts<now()-interval '5 minutes' or starts>now()+interval '366 days' or ends<=starts or ends>starts+interval '7 days' or not private.space_text(p_data->>'title',100) or length(btrim(p_data->>'title'))<3 or not private.space_text(p_data->>'description',5000) or coalesce(p_data->>'kind','') not in ('gaming','voice','discussion') or coalesce(p_data->>'banner','') not in ('nebula','aurora','ember','ocean') then raise exception 'Invalid event details' using errcode='22023';end if;
   if p_data->>'session' is not null then select * into g from public.gaming_sessions where id=(p_data->>'session')::uuid;if not found or not public.squad_access(g.id) or g.host_id<>actor or (g.community_id is not null and g.community_id<>cid) then raise exception 'Linked session unavailable' using errcode='42501';end if;end if;
   if p_data->>'voice' is not null and not exists(select 1 from public.channels where id=(p_data->>'voice')::uuid and community_id=cid and kind='voice' and public.channel_access(id,'connect')) then raise exception 'Linked voice room unavailable' using errcode='42501';end if;
   if p_operation='event-create' then
    insert into public.events(id,community_id,host_id,title,description,kind,banner,starts_at,ends_at,time_zone,gaming_session_id,voice_channel_id) values(item,cid,actor,p_data->>'title',p_data->>'description',p_data->>'kind',p_data->>'banner',starts,ends,tz,(p_data->>'session')::uuid,(p_data->>'voice')::uuid) on conflict do nothing;
    if not exists(select 1 from public.events where id=item and host_id=actor and community_id=cid) then raise exception 'Event unavailable' using errcode='42501';end if;
   else update public.events set title=p_data->>'title',description=p_data->>'description',kind=p_data->>'kind',banner=p_data->>'banner',starts_at=starts,ends_at=ends,time_zone=tz,gaming_session_id=(p_data->>'session')::uuid,voice_channel_id=(p_data->>'voice')::uuid,revision=revision+1,updated_at=now() where id=item;end if;
  end if;
  if p_operation<>'event-create' then
   select revision into old_revision from public.events where id=item;
   insert into private.space_audit(community_id,actor_id,resource_id,action) values(cid,actor,item,p_operation);
   for member_row in select user_id from public.event_rsvps where event_id=item and response='going' limit 5000 loop perform private.emit_notification(member_row.user_id,actor,'event_updates','event',item,'event-update:'||item::text||':'||old_revision::text||':'||member_row.user_id::text);end loop;
  end if;
  return jsonb_build_object('id',item);
 else raise exception 'Invalid operation' using errcode='22023';end if;
end $$;
revoke all on function private.space_text(text,integer),private.prayer_dto(public.prayer_requests),private.event_dto(public.events) from public,anon,authenticated;
revoke all on function public.space_budget(text),public.space_read(text,uuid,uuid,bigint,text),public.space_command(text,jsonb) from public,anon;
grant execute on function public.space_budget(text),public.space_read(text,uuid,uuid,bigint,text),public.space_command(text,jsonb) to authenticated;
