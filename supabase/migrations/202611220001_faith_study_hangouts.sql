-- Scheduled study events reuse community channels, event calendars and existing LiveKit admission.
alter table public.channels add column faith_hangout_only boolean not null default false;
alter table public.events add column faith_study_only boolean not null default false;
create table public.faith_study_hangouts(
 event_id uuid primary key references public.events on delete cascade,
 session_id uuid not null references public.bible_study_sessions on delete cascade,
 channel_id uuid not null unique references public.channels on delete cascade,
 audience text not null check(audience in ('circle','selected')),
 revision integer not null default 1 check(revision>0),ended_at timestamptz
);
create index faith_hangouts_session on public.faith_study_hangouts(session_id,event_id);
create index faith_hangout_event_schedule on public.events(community_id,starts_at,id) where kind='voice' and status='scheduled';
create table public.faith_hangout_participants(
 event_id uuid not null references public.faith_study_hangouts on delete cascade,
 user_id uuid not null references auth.users on delete cascade,primary key(event_id,user_id)
);
create index faith_hangout_participants_user on public.faith_hangout_participants(user_id,event_id);
alter table public.faith_study_hangouts enable row level security;
alter table public.faith_hangout_participants enable row level security;
revoke all on public.faith_study_hangouts,public.faith_hangout_participants from public,anon,authenticated;
-- Explicit-actor helper supports both signed-in reads and the existing service-only enforcement worker.
create function private.faith_hangout_allowed(u uuid,eid uuid,joining boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.faith_study_hangouts h join public.events e on e.id=h.event_id join public.bible_study_sessions s on s.id=h.session_id join public.bible_studies st on st.id=s.study_id join public.channels c on c.id=h.channel_id
 where e.id=eid and e.faith_study_only and c.faith_hangout_only and e.community_id=st.circle_id and c.community_id=e.community_id and c.kind='voice' and not c.disabled and c.deleted_at is null and c.archived_at is null and e.voice_channel_id=c.id and not e.moderation_hidden
 and private.faith_prayer_member(u,e.community_id) and private.faith_prayer_leader(e.host_id,e.community_id) and not private.squad_blocked(u,e.host_id)
 and st.status='published' and st.rights_confirmed and private.squad_live(st.created_by) and not private.squad_blocked(u,st.created_by)
 and (h.audience='circle' or u=e.host_id or exists(select 1 from public.faith_hangout_participants where event_id=eid and user_id=u))
 and (not joining or (e.status='scheduled' and h.ended_at is null and clock_timestamp()>=e.starts_at and clock_timestamp()<e.ends_at and (s.release_at is null or s.release_at<=clock_timestamp()))));
$$;
create function private.faith_hangout_channel(u uuid,cid uuid,joining boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select (not exists(select 1 from public.channels where id=cid and faith_hangout_only) and not exists(select 1 from public.faith_study_hangouts where channel_id=cid)) or exists(select 1 from public.faith_study_hangouts where channel_id=cid and private.faith_hangout_allowed(u,event_id,joining) and exists(select 1 from public.events e where e.id=event_id and e.status='scheduled' and e.ends_at>now()) and ended_at is null);
$$;
create function public.faith_hangout_access(p_event uuid) returns boolean language sql stable security definer set search_path='' as $$select private.faith_hangout_allowed(auth.uid(),p_event,false)$$;
grant select on public.faith_study_hangouts to authenticated;
create policy faith_hangout_read on public.faith_study_hangouts for select to authenticated using(public.faith_hangout_access(event_id));
-- No participant roster grants: use current authorized projections, never raw allowlists.
CREATE OR REPLACE FUNCTION public.channel_access(p_channel uuid, p_permission text DEFAULT 'view'::text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$select (p_permission in ('view','post','connect','attach') and coalesce(exists(select 1 from public.channels c join public.communities g on g.id=c.community_id
 where c.id=p_channel and not c.disabled and not g.archived and c.archived_at is null and c.deleted_at is null
 and public.phase10_channel_access(p_channel,case when p_permission='attach' then 'post' else p_permission end)
 and (p_permission not in ('post','attach') or not exists(select 1 from private.community_posting_restrictions r where r.community_id=c.community_id and r.user_id=auth.uid() and r.until_at>now()))
 and (p_permission<>'attach' or (c.attachment_policy<>'none' and (c.attachment_policy='posters' or private.community_rank(c.community_id)>=20)))),false)) and private.faith_hangout_channel(auth.uid(),p_channel,p_permission='connect')$function$;
CREATE OR REPLACE FUNCTION private.voice_allowed(p_user uuid, p_channel uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$select (exists(select 1 from public.channels c join public.communities g on g.id=c.community_id where c.id=p_channel and not c.disabled and c.archived_at is null and c.deleted_at is null and not g.archived) and private.phase10_voice_allowed(p_user,p_channel)) and private.faith_hangout_channel(p_user,p_channel,true)$function$;
CREATE OR REPLACE FUNCTION private.channel_user_allowed(u uuid, cid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$select (exists(select 1 from public.channels where id=cid and not disabled and archived_at is null and deleted_at is null) and private.phase10_channel_user_allowed(u,cid)) and private.faith_hangout_channel(u,cid,false)$function$;
CREATE OR REPLACE FUNCTION private.event_allowed(u uuid, e uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$select (exists(select 1 from public.events where id=e and not moderation_hidden) and private.phase10_event_allowed(u,e)) and ((not exists(select 1 from public.events where id=e and faith_study_only) and not exists(select 1 from public.faith_study_hangouts where event_id=e)) or private.faith_hangout_allowed(u,e,false))$function$;
CREATE OR REPLACE FUNCTION public.voice_admit(p_channel uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare admission jsonb;link record;s public.gaming_sessions; v private.squad_voice_sessions; display text; n integer;
begin
 if not private.is_verified_member() then raise exception 'Voice access unavailable' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,746));
 if exists(select 1 from private.squad_voice_sessions where user_id=auth.uid() and expires_at>clock_timestamp()) then raise exception 'Leave your current voice session first' using errcode='55000';end if;
 select * into s from public.gaming_sessions where id=p_channel for update;
 if not found then admission:=private.community_voice_admit(p_channel);select h.event_id,e.community_id into link from public.faith_study_hangouts h join public.events e on e.id=h.event_id where h.channel_id=p_channel;if found then admission:=admission||jsonb_build_object('destination','/faith-circles/'||link.community_id::text||'/hangouts/'||link.event_id::text);end if;return admission;end if;
 if not private.squad_voice_allowed(auth.uid(),s) then raise exception 'Voice access unavailable' using errcode='42501';end if;
 if not exists(select 1 from private.voice_worker where checked_at>clock_timestamp()-interval '15 seconds') then raise exception 'Voice enforcement unavailable' using errcode='55000';end if;
 if exists(select 1 from private.voice_sessions where user_id=auth.uid() and expires_at>clock_timestamp()) then raise exception 'Leave your current voice session first' using errcode='55000';end if;
 -- Voice and membership budgets have separate row-lock domains.
 insert into private.voice_budget values(auth.uid(),date_trunc('minute',now()),1) on conflict(user_id,minute) do update set attempts=private.voice_budget.attempts+1 returning attempts into n;
 if n>10 then return jsonb_build_object('limited',true);end if;
 delete from private.voice_budget where minute<now()-interval '1 day';
 if (select count(*) from private.squad_voice_sessions where session_id=s.id and epoch=s.voice_epoch and expires_at>clock_timestamp())>=s.max_players then raise exception 'Voice room is full' using errcode='54000';end if;
 insert into private.squad_voice_sessions(user_id,session_id,epoch) values(auth.uid(),s.id,s.voice_epoch) on conflict(user_id) do update set session_id=excluded.session_id,epoch=excluded.epoch,ticket=gen_random_uuid(),expires_at=clock_timestamp()+interval '120 seconds' returning * into v;
 select display_name into display from public.profiles where id=auth.uid();
 return jsonb_build_object('room',private.voice_room_name(s.id,s.voice_epoch),'ticket',v.ticket,'limit',s.max_players,'name',coalesce(display,'Member'),'destination','/squad-up/'||s.id::text);
end $function$
;
CREATE OR REPLACE FUNCTION public.space_command(p_operation text, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=auth.uid();target uuid;cid uuid;item uuid;p public.prayer_requests;e public.events;g public.gaming_sessions;ci public.community_notification_invitations;gi public.gaming_session_invitations;t text;kind_value text;starts timestamptz;ends timestamptz;tz text;old_revision integer;pref jsonb;field text;member_row record;begin
 if not private.squad_live(actor) then raise exception 'Not authorized' using errcode='42501';end if;
 if p_operation in ('event-update','event-cancel') and exists(select 1 from public.faith_study_hangouts where event_id=(p_data->>'id')::uuid) then raise exception 'Use the Study Hangout controls' using errcode='42501';end if;

 -- New Circle prayers require the revision-aware, audited Circle workflow. Legacy rows are unchanged.
 if p_operation like 'prayer-%' and exists(select 1 from public.prayer_requests q where q.circle_scope and q.id=case when p_operation='prayer-create' then (p_data->>'id')::uuid else (p_data->>'prayer')::uuid end) then raise exception 'Use the Circle prayer workflow' using errcode='42501';end if;

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
end $function$
;
create function private.faith_hangout_dto(eid uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',e.id,'circle',e.community_id,'circle_name',c.name,'study',st.id,'session',s.id,'title',e.title,'description',e.description,'starts_at',e.starts_at,'ends_at',e.ends_at,'time_zone',e.time_zone,'channel',h.channel_id,'audience',h.audience,'revision',h.revision,'host',e.host_id,
 'state',case when e.status='cancelled' then 'cancelled' when h.ended_at is not null or e.ends_at<=now() then 'ended' when e.starts_at<=now() then 'live' else 'upcoming' end,
 'can_manage',auth.uid()=e.host_id and private.faith_editor(e.community_id) or private.community_rank(e.community_id)>=30,
 'can_moderate',auth.uid()=e.host_id and private.faith_editor(e.community_id) or private.community_rank(e.community_id)>=20,
 'can_join',public.channel_access(h.channel_id,'connect') and not v.locked,'limit',v.participant_limit,
 'reference',case when public.faith_room_access(e.community_id,st.id,s.id) then s.scripture_reference else null end,
 'study_title',case when public.faith_room_access(e.community_id,st.id,s.id) then st.title else null end,'session_title',case when public.faith_room_access(e.community_id,st.id,s.id) then s.title else null end,
 'reading_available',public.faith_room_access(e.community_id,st.id,s.id))
 from public.faith_study_hangouts h join public.events e on e.id=h.event_id join public.communities c on c.id=e.community_id join public.bible_study_sessions s on s.id=h.session_id join public.bible_studies st on st.id=s.study_id join public.voice_rooms v on v.channel_id=h.channel_id where e.id=eid and public.faith_hangout_access(e.id);
$$;
create function public.faith_hangout_read(p_view text,p_circle uuid default null,p_resource uuid default null,p_after uuid default null,p_size integer default 20) returns jsonb language plpgsql security definer set search_path='' as $$
declare items jsonb;cid uuid;sid uuid;begin
 if not private.squad_live(auth.uid()) then raise exception 'Unavailable' using errcode='42501';end if;
 if p_size is null or p_size not between 1 and 40 then raise exception 'Invalid page' using errcode='22023';end if;
 if not private.take_limit('faith-hangout-read:'||auth.uid()::text,180,60) then return jsonb_build_object('limited',true);end if;
 if p_view='circles' then
  select coalesce(jsonb_agg(to_jsonb(q)order by q.id),'[]')into items from(select f.community_id id,c.name from public.faith_circles f join public.communities c on c.id=f.community_id where private.faith_editor(f.community_id) and (p_after is null or f.community_id>p_after)order by f.community_id limit p_size+1)q;
 elsif p_view in ('studies','sessions','members') then
  if not private.faith_editor(p_circle) then raise exception 'Leader approval required' using errcode='42501';end if;
  if p_view='studies' then
   select coalesce(jsonb_agg(to_jsonb(q)order by q.id),'[]')into items from(select id,title from public.bible_studies where circle_id=p_circle and status='published' and rights_confirmed and public.faith_study_access(id) and (p_after is null or id>p_after)order by id limit p_size+1)q;
  elsif p_view='sessions' then
   if not exists(select 1 from public.bible_studies where id=p_resource and circle_id=p_circle and status='published' and rights_confirmed and public.faith_study_access(id)) then raise exception 'Study unavailable' using errcode='42501';end if;
   if p_after is not null and not exists(select 1 from public.bible_study_sessions where id=p_after and study_id=p_resource) then raise exception 'Invalid cursor' using errcode='42501';end if;
   select coalesce(jsonb_agg(to_jsonb(q)order by q.session_number,q.id),'[]')into items from(select id,title,session_number,release_at from public.bible_study_sessions where study_id=p_resource and (p_after is null or session_number>(select session_number from public.bible_study_sessions where id=p_after and study_id=p_resource))order by session_number,id limit p_size+1)q;
  else
   select coalesce(jsonb_agg(to_jsonb(q)order by q.id),'[]')into items from(select m.user_id id,p.display_name name from public.community_members m join public.profiles p on p.id=m.user_id where m.community_id=p_circle and m.status='active' and private.squad_live(m.user_id) and not private.squad_blocked(auth.uid(),m.user_id) and (p_after is null or m.user_id>p_after)order by m.user_id limit p_size+1)q;
  end if;
 elsif p_view='index' then
  if p_circle is not null and not public.faith_member_access(p_circle) then raise exception 'Unavailable' using errcode='42501';end if;
  if p_after is not null and not exists(select 1 from public.events pe join public.faith_study_hangouts ph on ph.event_id=pe.id where pe.id=p_after and public.faith_hangout_access(pe.id) and (p_circle is null or pe.community_id=p_circle) and (p_resource is null or ph.session_id=p_resource)) then raise exception 'Invalid cursor' using errcode='42501';end if;
  select coalesce(jsonb_agg(private.faith_hangout_dto(q.id)order by q.starts_at,q.id),'[]')into items from(select e.id,e.starts_at from public.events e join public.faith_study_hangouts h on h.event_id=e.id where public.faith_hangout_access(e.id) and (p_circle is null or e.community_id=p_circle) and (p_resource is null or h.session_id=p_resource) and e.status='scheduled' and h.ended_at is null and e.ends_at>now() and (p_after is null or (e.starts_at,e.id)>(select starts_at,id from public.events where id=p_after))order by e.starts_at,e.id limit p_size+1)q;
 elsif p_view in ('detail','questions','participants') then
  if not public.faith_hangout_access(p_resource) then raise exception 'Hangout unavailable' using errcode='42501';end if;
  select e.community_id,h.session_id into cid,sid from public.events e join public.faith_study_hangouts h on h.event_id=e.id where e.id=p_resource;
  if p_circle is not null and cid<>p_circle then raise exception 'Unavailable' using errcode='42501';end if;
  if p_view='detail' then return private.faith_hangout_dto(p_resource);
  elsif p_view='questions' then
   if not exists(select 1 from public.bible_study_sessions s where s.id=sid and public.faith_room_access(cid,s.study_id,s.id)) then raise exception 'Session not released' using errcode='42501';end if;
   if p_after is not null and not exists(select 1 from public.study_questions where id=p_after and session_id=sid) then raise exception 'Invalid cursor' using errcode='42501';end if;
   select coalesce(jsonb_agg(to_jsonb(q)order by q.display_order,q.id),'[]')into items from(select id,question_text,display_order from public.study_questions where session_id=sid and (p_after is null or display_order>(select display_order from public.study_questions where id=p_after and session_id=sid))order by display_order,id limit p_size+1)q;
  else
   if not exists(select 1 from public.events e where e.id=p_resource and (e.host_id=auth.uid() and private.faith_editor(cid) or private.community_rank(cid)>=30)) then raise exception 'Unavailable' using errcode='42501';end if;
   select coalesce(jsonb_agg(to_jsonb(q)order by q.id),'[]')into items from(select p.user_id id,prof.display_name name from public.faith_hangout_participants p join public.profiles prof on prof.id=p.user_id where p.event_id=p_resource and not private.squad_blocked(auth.uid(),p.user_id) and private.space_rank(p.user_id,cid)>0 and (p_after is null or p.user_id>p_after)order by p.user_id limit p_size+1)q;
  end if;
 else raise exception 'Invalid view' using errcode='22023';end if;
 return jsonb_build_object('items',items);
end$$;

create function public.faith_hangout_command(p_circle uuid,p_operation text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=auth.uid();h public.faith_study_hangouts;e public.events;s public.bible_study_sessions;st public.bible_studies;item uuid;ch uuid;v public.voice_rooms;u uuid;targets uuid[];starts timestamptz;ends timestamptz;tz text;can_manage boolean;begin
 if not private.squad_live(a) or jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Unavailable' using errcode='42501';end if;
 if octet_length(p_data::text)>20000 or p_data ?| array['actor','user_id','role','host_id','room','grants','channel'] then raise exception 'Invalid input' using errcode='22023';end if;
 perform pg_advisory_xact_lock(20261030);perform 1 from public.communities where id=p_circle for update;
 if not public.faith_member_access(p_circle) then raise exception 'Unavailable' using errcode='42501';end if;
 if not private.take_limit('faith-hangout-write:'||a::text,30,60) then return jsonb_build_object('limited',true);end if;
 item:=(p_data->>'id')::uuid;
 if p_operation in ('publish','access') then
  if coalesce(p_data->>'audience','') not in ('circle','selected') or jsonb_typeof(p_data->'participants') is distinct from 'array' or jsonb_array_length(p_data->'participants')>100 then raise exception 'Invalid audience' using errcode='22023';end if;
  select coalesce(array_agg(distinct x::uuid order by x::uuid),'{}')into targets from jsonb_array_elements_text(p_data->'participants')x;
  foreach u in array targets loop
   if not private.faith_prayer_member(u,p_circle) or private.squad_blocked(a,u) then raise exception 'Participant unavailable' using errcode='42501';end if;
  end loop;
 end if;
 if p_operation='publish' then
  if not private.faith_editor(p_circle) then raise exception 'Approved leader required' using errcode='42501';end if;
  select * into s from public.bible_study_sessions where id=(p_data->>'session')::uuid;select * into st from public.bible_studies where id=s.study_id;
  if st.id is null or st.circle_id<>p_circle or st.status<>'published' or not st.rights_confirmed or not public.faith_study_access(st.id) then raise exception 'Session unavailable' using errcode='42501';end if;
  tz:=p_data->>'time_zone';if not exists(select 1 from pg_catalog.pg_timezone_names where name=tz) then raise exception 'Invalid time zone' using errcode='22023';end if;
  starts:=(p_data->>'starts_local')::timestamp at time zone tz;ends:=(p_data->>'ends_local')::timestamp at time zone tz;
  if starts is null or ends is null or (starts at time zone tz)<>(p_data->>'starts_local')::timestamp or (ends at time zone tz)<>(p_data->>'ends_local')::timestamp or starts<now()-interval '5 minutes' or starts>now()+interval '366 days' or ends<=starts or ends>starts+interval '7 days' or (s.release_at is not null and s.release_at>starts) or not private.space_text(p_data->>'title',100) or length(btrim(p_data->>'title'))<3 or not private.space_text(p_data->>'description',5000) or (p_data->>'limit')::integer not between 2 and 50 or p_data->>'limit' is null then raise exception 'Invalid schedule' using errcode='22023';end if;
  select * into e from public.events where id=item;
  if found then
   select * into h from public.faith_study_hangouts where event_id=item;
   if h.event_id is null or e.host_id<>a or e.community_id<>p_circle or h.session_id<>s.id or e.title<>p_data->>'title' or e.description<>p_data->>'description' or e.starts_at<>starts or e.ends_at<>ends or e.time_zone<>tz or h.audience<>p_data->>'audience' or (select participant_limit from public.voice_rooms where channel_id=h.channel_id)<>(p_data->>'limit')::integer or targets is distinct from (select coalesce(array_agg(user_id order by user_id),'{}')from public.faith_hangout_participants where event_id=item) then raise exception 'Hangout changed' using errcode='40001';end if;
   return jsonb_build_object('ok',true,'id',item);
  end if;
  if not public.space_budget('event') then return jsonb_build_object('limited',true);end if;
  if (select count(*) from public.faith_study_hangouts hh join public.events ee on ee.id=hh.event_id where ee.community_id=p_circle and ee.status='scheduled' and ee.ends_at>now() and hh.ended_at is null)>=100 then raise exception 'Study schedule is full' using errcode='22023';end if;
  ch:=gen_random_uuid();
  insert into public.channels(id,community_id,name,description,kind,is_private,position,faith_hangout_only)values(ch,p_circle,'study-'||replace(item::text,'-',''),'Scheduled Faith Circle study. Access is controlled by the study event.','voice',false,0,true);
  insert into public.voice_rooms(channel_id,participant_limit)values(ch,(p_data->>'limit')::integer) on conflict(channel_id)do update set participant_limit=excluded.participant_limit;
  insert into public.events(id,community_id,host_id,title,description,kind,banner,starts_at,ends_at,time_zone,voice_channel_id,faith_study_only)values(item,p_circle,a,p_data->>'title',p_data->>'description','voice','aurora',starts,ends,tz,ch,true);
  insert into public.faith_study_hangouts(event_id,session_id,channel_id,audience)values(item,s.id,ch,p_data->>'audience');
  insert into public.faith_hangout_participants select item,unnest(targets);
  insert into public.event_rsvps(event_id,user_id,response)values(item,a,'going');
 else
  select * into e from public.events where id=item and community_id=p_circle for update;
  select * into h from public.faith_study_hangouts where event_id=item for update;
  if h.event_id is null or not public.faith_hangout_access(item) then raise exception 'Hangout unavailable' using errcode='42501';end if;
  can_manage:=a=e.host_id and private.faith_editor(p_circle) or private.community_rank(p_circle)>=30;
  if p_operation='remove' then
   u:=(p_data->>'target')::uuid;
   if not(can_manage or private.community_rank(p_circle)>=20) or u=a or not exists(select 1 from private.voice_sessions where channel_id=h.channel_id and user_id=u) or (private.space_rank(u,p_circle)>=20 and private.space_rank(u,p_circle)>=private.space_rank(a,p_circle)) or (exists(select 1 from private.platform_roles where user_id=u) and private.platform_rank()<=coalesce((select case role when 'owner' then 40 when 'administrator' then 30 else 20 end from private.platform_roles where user_id=u),0)) then raise exception 'Removal unavailable' using errcode='42501';end if;
   if not private.space_text(p_data->>'reason',300) or length(btrim(p_data->>'reason'))<5 then raise exception 'Reason required' using errcode='22023';end if;
   insert into private.voice_suspensions values(h.channel_id,u,now()+interval '15 minutes')on conflict(channel_id,user_id)do update set until_at=excluded.until_at;
   delete from private.voice_sessions where channel_id=h.channel_id and user_id=u;
   select * into v from public.voice_rooms where channel_id=h.channel_id;
   insert into private.space_audit(community_id,actor_id,resource_id,action,reason)values(p_circle,a,item,'study-hangout-remove',p_data->>'reason');
   return jsonb_build_object('ok',true,'id',item,'room',private.voice_room_name(h.channel_id,v.epoch),'target',u);
  end if;
  if not can_manage then raise exception 'Host controls unavailable' using errcode='42501';end if;
  if (p_data->>'revision')::integer is distinct from h.revision then raise exception 'Hangout changed' using errcode='40001';end if;
  if e.status<>'scheduled' or h.ended_at is not null or e.ends_at<=now() then raise exception 'Hangout has ended' using errcode='55000';end if;
  select * into v from public.voice_rooms where channel_id=h.channel_id for update;
  if p_operation='access' then
   update public.faith_study_hangouts set audience=p_data->>'audience',revision=revision+1 where event_id=item;
   delete from public.faith_hangout_participants where event_id=item;
   insert into public.faith_hangout_participants select item,unnest(targets);
   delete from public.event_rsvps where event_id=item and not private.faith_hangout_allowed(user_id,item,false);
  elsif p_operation='cancel' then
   update public.events set status='cancelled',revision=revision+1,updated_at=now() where id=item;
   update public.faith_study_hangouts set revision=revision+1 where event_id=item;
  elsif p_operation='end' then
   if e.starts_at>now() then raise exception 'Cancel a future Hangout instead' using errcode='22023';end if;
   update public.faith_study_hangouts set ended_at=clock_timestamp(),revision=revision+1 where event_id=item;
   update public.events set ends_at=greatest(clock_timestamp(),starts_at+interval '1 second'),revision=revision+1,updated_at=now() where id=item;
  else raise exception 'Invalid operation' using errcode='22023';end if;
  update public.voice_rooms set epoch=gen_random_uuid(),locked=p_operation<>'access' where channel_id=h.channel_id;
  delete from private.voice_sessions where channel_id=h.channel_id;
  insert into private.space_audit(community_id,actor_id,resource_id,action)values(p_circle,a,item,'study-hangout-'||p_operation);
  return jsonb_build_object('ok',true,'id',item,'room',private.voice_room_name(h.channel_id,v.epoch));
 end if;
 insert into private.space_audit(community_id,actor_id,resource_id,action)values(p_circle,a,item,'study-hangout-publish');
 return jsonb_build_object('ok',true,'id',item);
end$$;
-- Upcoming study meetings join the existing home calendar projection without participant disclosure.
create or replace function public.faith_circle_events() returns jsonb language plpgsql security definer set search_path='' as $$
declare items jsonb;begin
 if not private.squad_live(auth.uid()) then raise exception 'Unavailable' using errcode='42501';end if;
 if not private.take_limit('faith-circle-read:'||auth.uid()::text,120,900) then return jsonb_build_object('limited',true);end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'title',q.title,'starts_at',q.starts_at,'circleId',q.circle_id,'circleName',q.circle_name)order by q.starts_at,q.id),'[]')into items from(
 select e.id,e.title,e.starts_at,c.id circle_id,c.name circle_name from public.events e join public.communities c on c.id=e.community_id join public.faith_circles f on f.community_id=c.id where public.faith_member_access(c.id) and public.event_access(e.id) and e.status='scheduled' and e.ends_at>now() and (exists(select 1 from public.faith_study_hangouts h where h.event_id=e.id and h.ended_at is null) or (e.voice_channel_id=f.hangout_channel_id and public.channel_access(f.hangout_channel_id,'connect')))order by e.starts_at,e.id limit 6)q;
 return jsonb_build_object('items',items);
end$$;
revoke all on function private.faith_hangout_allowed(uuid,uuid,boolean),private.faith_hangout_channel(uuid,uuid,boolean),private.faith_hangout_dto(uuid) from public,anon,authenticated;
revoke all on function public.faith_hangout_access(uuid),public.faith_hangout_read(text,uuid,uuid,uuid,integer),public.faith_hangout_command(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.faith_hangout_access(uuid),public.faith_hangout_read(text,uuid,uuid,uuid,integer),public.faith_hangout_command(uuid,text,jsonb) to authenticated;
notify pgrst,'reload schema';

-- Administrative event listings do not bypass a Study Hangout audience. Other admin scopes remain unchanged.
CREATE OR REPLACE FUNCTION public.admin_read(p_view text DEFAULT 'overview'::text, p_community uuid DEFAULT NULL::uuid, p_before bigint DEFAULT NULL::bigint, p_search text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare pr integer:=private.platform_rank();cr integer:=private.admin_community_rank(p_community);result jsonb;begin
 if not private.is_verified_member() or length(p_search)>48 or (p_before is not null and p_before<1) then raise exception 'Not authorized' using errcode='42501';end if;
 if p_view='context' then return jsonb_build_object('rank',pr,'communities',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'rank',private.admin_community_rank(c.id),'archived',c.archived) order by c.name) from public.communities c where pr>=20 or private.admin_community_rank(c.id)>=20),'[]'),'retention_days',case when pr>=30 then (select evidence_days from private.admin_settings) else null end);end if;
 if pr<20 and cr<20 then raise exception 'Not authorized' using errcode='42501';end if;
 if not private.take_limit('admin-read:'||auth.uid()::text,300,900) then raise exception 'Rate limited' using errcode='42501';end if;
 if p_view='overview' then return jsonb_build_object('members',(select count(*) from public.profiles p where (p_community is null and pr>=20) or exists(select 1 from public.community_members m where m.user_id=p.id and m.community_id=p_community)),'communities',(select count(*) from public.communities where (p_community is null and pr>=20) or id=p_community),'messages_7d',(select count(*) from public.messages m join public.channels c on c.id=m.channel_id where m.created_at>now()-interval '7 days' and ((p_community is null and pr>=20) or c.community_id=p_community)),'open_reports',(select count(*) from private.moderation_cases c where c.status='open' and private.case_access(c) and (p_community is null or c.community_id=p_community)),'voice_admissions',(select count(*) from private.voice_sessions v join public.channels c on c.id=v.channel_id where v.expires_at>now() and ((p_community is null and pr>=20) or c.community_id=p_community)),'posts_7d',(select count(*) from public.posts where created_at>now()-interval '7 days' and ((p_community is null and pr>=20) or community_id=p_community)));end if;
 if p_view='members' then
 select coalesce(jsonb_agg(x order by x.username),'[]') into result from (select p.id,p.username,p.display_name,case when pr>=20 then case when u.banned_until>now() then 'restricted' else 'active' end else m.status end status,case when pr>=20 then r.role else null end platform_role,m.role_id community_role from public.profiles p join auth.users u on u.id=p.id left join private.platform_roles r on r.user_id=p.id left join public.community_members m on m.user_id=p.id and m.community_id=p_community where ((p_community is null and pr>=20) or m.community_id=p_community) and (p_search='' or left(lower(p.username),length(p_search))=lower(p_search)) order by p.username limit 50)x;return result;
 elsif p_view='reports' then
 select coalesce(jsonb_agg(x order by x.seq desc),'[]') into result from (select c.id,c.seq,c.community_id,c.target_type,c.target_id,c.subject_id,c.status,case when c.retain_until>now() then c.reason else 'Report details expired' end reason,case when c.retain_until>now() then c.evidence else null end evidence,c.retain_until,coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'filename',m.filename,'mime',m.mime)) from private.case_media m where m.case_id=c.id and c.retain_until>now()),'[]') media,c.reviewed_by,c.reviewed_at,c.created_at from private.moderation_cases c where private.case_access(c) and (p_community is null or c.community_id=p_community) and (p_before is null or c.seq<p_before) order by c.seq desc limit 30)x;
 insert into private.admin_audit(actor_id,community_id,action,reason) values(auth.uid(),p_community,'evidence.review','Opened the scoped moderation queue');return result;
 elsif p_view='audit' then
 select coalesce(jsonb_agg(x order by x.id desc),'[]') into result from (select id,actor_id,community_id,action,target_id,reason,created_at from private.admin_audit where ((p_community is null and pr>=20) or community_id=p_community) and (p_community is null or community_id=p_community) and (p_before is null or id<p_before) order by id desc limit 30)x;return result;
 elsif p_view='appeals' then
 select coalesce(jsonb_agg(x order by x.seq desc),'[]') into result from (select a.* from public.moderation_appeals a left join private.moderation_cases c on c.id=a.case_id where (pr>=30 or (cr>=30 and c.community_id=p_community and c.target_type<>'dm')) and (p_community is null or c.community_id=p_community) and (p_before is null or a.seq<p_before) order by a.seq desc limit 30)x;return result;
 elsif p_view='communities' then
 select coalesce(jsonb_agg(x),'[]') into result from (select c.*,coalesce(s.guidelines,'Be kind. Respect privacy. Welcome others.') guidelines,coalesce(s.allow_events,true) allow_events,coalesce(s.allow_prayers,true) allow_prayers from public.communities c left join public.community_settings s on s.community_id=c.id where ((p_community is null and pr>=20) or c.id=p_community) order by c.name limit 100)x;return result;
 elsif p_view='channels' then
 select coalesce(jsonb_agg(x order by x.position,x.name),'[]') into result from (select c.id,c.community_id,c.name,c.description,c.kind,c.is_private,c.position,c.disabled,c.archived_at,v.participant_limit,v.locked,(select coalesce(jsonb_agg(jsonb_build_object('user_id',vs.user_id,'username',p.username)),'[]') from private.voice_sessions vs join public.profiles p on p.id=vs.user_id where vs.channel_id=c.id and vs.expires_at>now()) participants from public.channels c left join public.voice_rooms v on v.channel_id=c.id where c.community_id=p_community and c.deleted_at is null and (not c.faith_hangout_only or private.faith_hangout_channel(auth.uid(),c.id,false)) order by c.position,c.name limit 200)x;return result;
 elsif p_view='events' then
 select coalesce(jsonb_agg(x order by x.seq desc),'[]') into result from (select id,seq,title,community_id,host_id,status,starts_at,moderation_hidden from public.events where (not faith_study_only or public.faith_hangout_access(events.id) or (host_id=auth.uid() and public.faith_member_access(community_id))) and ((p_community is null and pr>=20) or community_id=p_community) and (p_community is null or community_id=p_community) and (p_before is null or seq<p_before) order by seq desc limit 30)x;return result;
 elsif p_view='announcements' then
 select coalesce(jsonb_agg(x),'[]') into result from (select * from public.site_announcements where ((p_community is null and pr>=20) or community_id=p_community) and (p_community is null or community_id=p_community) order by updated_at desc limit 50)x;return result;
 end if;raise exception 'Unknown view' using errcode='22023';end$function$
;
