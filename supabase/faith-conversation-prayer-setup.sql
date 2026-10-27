-- Faith Circles discussion and prayer only. Preserve existing communities and content.
BEGIN;
SELECT pg_advisory_xact_lock(20261030);
DO $install$ BEGIN
 IF to_regclass('supabase_migrations.schema_migrations') IS NULL OR to_regprocedure('public.faith_room_access(uuid,uuid,uuid)') IS NULL THEN RAISE EXCEPTION 'Install the Faith study room update first.';END IF;
 IF NOT EXISTS(select 1 from supabase_migrations.schema_migrations where version='202611200001') THEN RAISE EXCEPTION 'Verify study room migration history first.';END IF;
 IF NOT EXISTS(select 1 from supabase_migrations.schema_migrations where version='202611210001') THEN
  IF to_regclass('public.faith_discussion_channels') IS NOT NULL OR to_regclass('public.faith_prayer_preferences') IS NOT NULL OR to_regprocedure('public.faith_conversation_command(uuid,text,jsonb)') IS NOT NULL THEN RAISE EXCEPTION 'Conversation objects exist without a migration record. Inspect history; do not reset.';END IF;
  EXECUTE $migration$
-- Faith Circles conversation links and owner-first prayers; existing chat/voice remain authoritative.
alter table public.prayer_requests add column circle_scope boolean not null default false,
 add column revision integer not null default 1 check(revision>0),
 add column prayer_update text not null default '' check(length(prayer_update)<=4000),
 add column testimony text not null default '' check(length(testimony)<=4000);
alter table public.prayer_requests drop constraint prayer_requests_visibility_check;
alter table public.prayer_requests add constraint prayer_requests_visibility_check check(
 (not circle_scope and visibility in ('community','moderators')) or (circle_scope and visibility in ('private','leaders','community')));
create index circle_prayer_page on public.prayer_requests(community_id,id) where circle_scope;
create index faith_prayer_comment_cursor on public.prayer_comments(prayer_id,id);
create table public.faith_discussion_channels(
 circle_id uuid not null references public.faith_circles(community_id) on delete cascade,
 purpose text not null check(purpose in ('general','scripture','reflections','prayer')),
 channel_id uuid not null references public.channels on delete cascade,primary key(circle_id,purpose)
);
create index faith_discussion_channel on public.faith_discussion_channels(channel_id);
create table public.faith_session_discussions(
 session_id uuid primary key references public.bible_study_sessions on delete cascade,
 message_id uuid not null unique references public.messages on delete cascade
);
create table public.faith_prayer_preferences(
 user_id uuid not null references auth.users on delete cascade,circle_id uuid not null references public.faith_circles(community_id) on delete cascade,
 replies boolean not null default true,primary key(user_id,circle_id)
);
create table private.faith_prayer_reports(
 id uuid primary key default gen_random_uuid(),circle_id uuid not null references public.faith_circles(community_id) on delete cascade,
 prayer_id uuid not null references public.prayer_requests on delete cascade,
 comment_id uuid references public.prayer_comments on delete set null,
 target_comment_id uuid,subject_id uuid references auth.users on delete set null,
 reporter_id uuid references auth.users on delete set null,
 reason text not null check(length(btrim(reason)) between 5 and 500),status text not null default 'open' check(status in ('open','dismissed','actioned')),
 created_at timestamptz not null default now(),retain_until timestamptz not null default now()+interval '90 days',
 reviewed_by uuid references auth.users on delete set null,reviewed_at timestamptz
);
create unique index faith_prayer_report_once on private.faith_prayer_reports(prayer_id,reporter_id,coalesce(target_comment_id,'00000000-0000-0000-0000-000000000000'::uuid));
create index faith_prayer_report_queue on private.faith_prayer_reports(circle_id,created_at,id);
create index faith_prayer_report_retention on private.faith_prayer_reports(retain_until);
create function private.faith_prayer_member(u uuid,cid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.squad_live(u) and private.space_rank(u,cid)>0 and exists(select 1 from public.faith_circles f join public.communities c on c.id=f.community_id join private.faith_circle_leaders l on l.user_id=f.leader_id and l.approved
 where f.community_id=cid and f.enabled and not c.archived and private.space_rank(f.leader_id,cid)>0 and not private.squad_blocked(u,f.leader_id));
$$;
create function private.faith_prayer_leader(u uuid,cid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.faith_prayer_member(u,cid) and exists(select 1 from private.faith_circle_leaders a where a.user_id=u and a.approved)
 and (exists(select 1 from public.faith_circles where community_id=cid and leader_id=u) or exists(select 1 from private.faith_co_leaders where circle_id=cid and user_id=u) or private.space_rank(u,cid)>=30);
$$;
create or replace function private.prayer_allowed(u uuid,p uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.prayer_requests q where q.id=p and private.space_rank(u,q.community_id)>0 and private.squad_live(q.author_id) and not private.squad_blocked(u,q.author_id) and
 case when q.circle_scope then private.faith_prayer_member(u,q.community_id) and
 (u=q.author_id or (q.status in ('open','answered') and (q.visibility='community' or (q.visibility='leaders' and private.faith_prayer_leader(u,q.community_id)))) or
 (q.visibility='community' and q.status='hidden' and private.space_rank(u,q.community_id)>=20))
 else (u=q.author_id or private.space_rank(u,q.community_id)>=20 or (q.visibility='community' and q.status in ('open','answered'))) end);
$$;
-- Legacy endpoints cannot widen a Circle prayer's audience or allow nonauthors to answer it.
create function private.faith_prayer_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_op='UPDATE' and (new.circle_scope is distinct from old.circle_scope or new.community_id<>old.community_id or new.author_id<>old.author_id) then raise exception 'Request identity is immutable' using errcode='42501';end if;
 if new.circle_scope then
  if not private.faith_prayer_member(auth.uid(),new.community_id) then raise exception 'Unavailable' using errcode='42501';end if;
  if tg_op='UPDATE' then
   if not private.prayer_allowed(auth.uid(),old.id) then raise exception 'Unavailable' using errcode='42501';end if;
   if auth.uid()<>old.author_id and (old.visibility<>'community' or private.space_rank(auth.uid(),old.community_id)<20 or new.status not in ('hidden','removed') or new.visibility<>old.visibility or (new.status<>'removed' and (new.body<>old.body or new.title<>old.title or new.prayer_update<>old.prayer_update or new.testimony<>old.testimony))) then raise exception 'Not authorized' using errcode='42501';end if;
   if old.status in ('hidden','removed') and new.status not in ('hidden','removed') then raise exception 'Request is moderated' using errcode='42501';end if;
   new.revision:=old.revision+1;
  elsif auth.uid() is distinct from new.author_id then raise exception 'Not authorized' using errcode='42501';end if;
  if new.status='removed' then new.title:='';new.body:='';new.prayer_update:='';new.testimony:='';end if;
 end if;return new;
end$$;
create trigger faith_prayer_guard before insert or update on public.prayer_requests for each row execute function private.faith_prayer_guard();
create function private.faith_prayer_notify(u uuid,p uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.prayer_requests q where q.id=p and (not q.circle_scope or (q.visibility<>'private' and coalesce((select replies from public.faith_prayer_preferences where user_id=u and circle_id=q.community_id),true))));
$$;
CREATE OR REPLACE FUNCTION private.emit_notification(u uuid, a uuid, k text, t text, r uuid, d text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if u is null or u=a or not private.squad_live(u) or (a is not null and (not private.squad_live(a) or private.squad_blocked(u,a))) or not private.notification_resource(u,t,r) or not exists(select 1 from public.notification_preferences p where user_id=u and coalesce((to_jsonb(p)->>k)::boolean,false)) then return;end if;
 if u is not null and t='channel' and (not private.chat_delivery_allowed(u,r,k) or not private.chat_navigation_take(u,'notification_delivery','00000000-0000-0000-0000-000000000000',60,300)) then return;end if;
 if t='prayer' and not private.faith_prayer_notify(u,r) then return;end if;
 insert into public.notifications(recipient_id,actor_id,kind,resource_type,resource_id,dedupe_key) values(u,a,k,t,r,d) on conflict(dedupe_key) do nothing;
 if found then perform realtime.send('{}'::jsonb,'changed','people:'||u::text,true);end if;
end $function$
;
CREATE OR REPLACE FUNCTION public.notification_access(p_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select exists(select 1 from public.notifications n join public.notification_preferences pref on pref.user_id=n.recipient_id where n.id=p_id and n.recipient_id=auth.uid() and (n.actor_id is null or not private.squad_blocked(auth.uid(),n.actor_id)) and coalesce((to_jsonb(pref)->>n.kind)::boolean,false) and private.notification_resource(auth.uid(),n.resource_type,n.resource_id)
 and (n.resource_type<>'prayer' or private.faith_prayer_notify(auth.uid(),n.resource_id))
 and (n.resource_type<>'channel' or private.chat_delivery_allowed(auth.uid(),n.resource_id,n.kind))
 and (n.kind not in ('event_reminders','event_updates') or exists(select 1 from public.event_rsvps where event_id=n.resource_id and user_id=auth.uid() and response='going'))
 and (n.kind<>'event_reminders' or exists(select 1 from public.events e join public.user_preferences up on up.user_id=auth.uid() where e.id=n.resource_id and up.event_reminders and e.status='scheduled' and e.starts_at>now() and n.dedupe_key like 'reminder:'||e.id::text||':'||e.revision::text||':%')));
$function$
;
-- Private prayers may be read through authorized existing views but never enter general lists/activity.
create or replace function private.prayer_dto(p public.prayer_requests) returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(p)||jsonb_build_object('seq',p.seq::text,'author_name',(select display_name from public.profiles where id=p.author_id),'can_manage',auth.uid()=p.author_id or (private.space_rank(auth.uid(),p.community_id)>=20 and (not p.circle_scope or p.visibility='community')),'moderator',private.space_rank(auth.uid(),p.community_id)>=20 and (not p.circle_scope or p.visibility='community'),'encouraged',exists(select 1 from public.prayer_encouragements where prayer_id=p.id and user_id=auth.uid()),'encouragements',(select count(*) from public.prayer_encouragements where prayer_id=p.id and not private.squad_blocked(auth.uid(),user_id)));
$$;
-- Guard raw legacy comment mutations too, including blocking the comment author and tombstones.
create function private.faith_prayer_comment_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare p public.prayer_requests;v public.prayer_comments;begin
 if tg_op='DELETE' then v:=old;else v:=new;end if;
 select * into p from public.prayer_requests where id=v.prayer_id;
 if p.circle_scope and auth.uid() is not null then
  if tg_op='DELETE' and ((p.status='removed' and auth.uid()=p.author_id) or not exists(select 1 from auth.users where id=old.author_id)) then return old;end if;
  if not private.prayer_allowed(auth.uid(),p.id) or p.status not in ('open','answered') or private.squad_blocked(auth.uid(),v.author_id) then raise exception 'Unavailable' using errcode='42501';end if;
  if tg_op='DELETE' and v.author_id<>auth.uid() and not(p.visibility='community' and private.space_rank(auth.uid(),p.community_id)>=20) then raise exception 'Not authorized' using errcode='42501';end if;
  if tg_op in ('INSERT','UPDATE') and v.author_id<>auth.uid() then raise exception 'Not authorized' using errcode='42501';end if;
  if tg_op='UPDATE' and (new.author_id<>old.author_id or new.prayer_id<>old.prayer_id) then raise exception 'Invalid comment' using errcode='42501';end if;
 end if;
 if tg_op='DELETE' then return old;else return new;end if;
end$$;
create trigger faith_prayer_comment_guard before insert or update or delete on public.prayer_comments for each row execute function private.faith_prayer_comment_guard();

create function public.faith_conversation_command(p_circle uuid,p_operation text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=auth.uid();p public.prayer_requests;v public.prayer_comments;item uuid;ch uuid;s public.bible_study_sessions;st public.bible_studies;msg uuid;purpose_value text;label text;report private.faith_prayer_reports;begin
 if not private.squad_live(a) then raise exception 'Unavailable' using errcode='42501';end if;
 if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>24000 or p_data ?| array['author_id','actor','user_id','role','circle_scope','community_id'] then raise exception 'Invalid input' using errcode='22023';end if;
 perform pg_advisory_xact_lock(20261030);perform 1 from public.communities where id=p_circle for update;
 if not public.faith_member_access(p_circle) then raise exception 'Unavailable' using errcode='42501';end if;
 if not private.take_limit('faith-conversation:'||a::text,60,60) then return jsonb_build_object('limited',true);end if;
 if p_operation='preferences' then
  if jsonb_typeof(p_data->'replies') is distinct from 'boolean' then raise exception 'Invalid preference' using errcode='22023';end if;
  insert into public.faith_prayer_preferences values(a,p_circle,(p_data->>'replies')::boolean) on conflict(user_id,circle_id)do update set replies=excluded.replies;return jsonb_build_object('ok',true);
 elsif p_operation in ('channel-link','channels-create') then
  if private.community_rank(p_circle)<30 then raise exception 'Community administrator required' using errcode='42501';end if;
  if p_operation='channels-create' then
   for purpose_value,label in select * from(values('general','general-conversation'),('scripture','questions-about-scripture'),('reflections','study-reflections'),('prayer','prayer-and-praise'))x(p,n) loop
    if not exists(select 1 from public.faith_discussion_channels where circle_id=p_circle and faith_discussion_channels.purpose=purpose_value) then
     select id into ch from public.channels where community_id=p_circle and name=label and kind='text' and deleted_at is null and archived_at is null and not disabled;
     if ch is null then perform public.channel_management(p_circle,'save',jsonb_build_object('name',label,'kind','text','description','Circle discussion. Never copy private prayers or reflections without consent.','position',0,'is_private',false,'attachment_policy','posters','notification_default','mentions','reason','Set up requested Circle discussion channels'));end if;
     select id into ch from public.channels where community_id=p_circle and name=label and kind='text' and deleted_at is null and archived_at is null and not disabled;
     insert into public.faith_discussion_channels values(p_circle,purpose_value,ch);ch:=null;
    end if;
   end loop;
  else
   purpose_value:=p_data->>'purpose';ch:=(p_data->>'channel')::uuid;
   if purpose_value not in ('general','scripture','reflections','prayer') or purpose_value is null or not exists(select 1 from public.channels where id=ch and community_id=p_circle and kind='text' and public.channel_access(id)) then raise exception 'Invalid channel' using errcode='22023';end if;
   insert into public.faith_discussion_channels values(p_circle,purpose_value,ch) on conflict(circle_id,purpose)do update set channel_id=excluded.channel_id;
  end if;
  insert into public.community_audit_log(community_id,actor_id,action,detail)values(p_circle,a,'faith_discussion_channels',jsonb_build_object('operation',p_operation));return jsonb_build_object('ok',true);
 elsif p_operation='session-thread' then
  select * into s from public.bible_study_sessions where id=(p_data->>'session')::uuid;select * into st from public.bible_studies where id=s.study_id;
  if not public.faith_room_access(p_circle,st.id,s.id) then raise exception 'Session unavailable' using errcode='42501';end if;
  select m.id,m.channel_id into msg,ch from public.faith_session_discussions d join public.messages m on m.id=d.message_id where d.session_id=s.id and m.deleted_at is null and public.channel_access(m.channel_id);
  if msg is null then
   if exists(select 1 from public.faith_session_discussions where session_id=s.id) then raise exception 'The original discussion was removed. Use the Circle channel.' using errcode='42501';end if;
   select c.id into ch from public.faith_discussion_channels d join public.channels c on c.id=d.channel_id where d.circle_id=p_circle and d.purpose='reflections' and public.channel_access(c.id,'post');
   if ch is null then select discussion_channel_id into ch from public.faith_circles where community_id=p_circle;end if;
   if ch is null or not public.channel_access(ch,'post') then raise exception 'Posting unavailable' using errcode='42501';end if;
   msg:=public.send_channel_message(gen_random_uuid(),ch,'Study discussion: '||replace(st.title,'@','＠')||' — '||replace(s.title,'@','＠')||E'\n'||s.scripture_reference||E'\n[Open study session](/faith-circles/'||p_circle::text||'/studies/'||st.id::text||'/sessions/'||s.id::text||')',null,null,'{}'::uuid[]);
   insert into public.faith_session_discussions values(s.id,msg);
  end if;return jsonb_build_object('href','/channels/'||ch::text||'?message='||msg::text,'ok',true);
 elsif p_operation='prayer-create' then
  item:=(p_data->>'id')::uuid;
  if not private.space_text(p_data->>'title',120) or not private.space_text(p_data->>'body',4000) or coalesce(p_data->>'visibility','private') not in ('private','leaders','community') or p_data->>'guidelines' is distinct from 'true' then raise exception 'Invalid prayer' using errcode='22023';end if;
  if not public.space_budget('prayer') then return jsonb_build_object('limited',true);end if;
  insert into public.prayer_requests(id,community_id,author_id,title,body,visibility,circle_scope) values(item,p_circle,a,p_data->>'title',p_data->>'body',coalesce(p_data->>'visibility','private'),true)on conflict do nothing;
  if not exists(select 1 from public.prayer_requests where id=item and community_id=p_circle and author_id=a and circle_scope and title=p_data->>'title' and body=p_data->>'body' and visibility=coalesce(p_data->>'visibility','private')) then raise exception 'Request changed' using errcode='40001';end if;
  return jsonb_build_object('ok',true,'id',item);
 elsif p_operation='report-review' then
  select * into report from private.faith_prayer_reports where id=(p_data->>'id')::uuid and circle_id=p_circle for update;
  select * into p from public.prayer_requests where id=report.prayer_id;
  if report.id is null or private.space_rank(a,p_circle)<20 or p.visibility<>'community' or not public.prayer_access(p.id) or report.reporter_id=a or p.author_id=a or report.subject_id=a or p_data->>'decision' is null or p_data->>'decision' not in ('dismissed','actioned') then raise exception 'Review unavailable' using errcode='42501';end if;
  update private.faith_prayer_reports set status=p_data->>'decision',reviewed_by=a,reviewed_at=now() where id=report.id;
  insert into private.space_audit(community_id,actor_id,resource_id,action)values(p_circle,a,report.id,'faith-report-review');return jsonb_build_object('ok',true);
 end if;
 select * into p from public.prayer_requests where id=(p_data->>'prayer')::uuid and community_id=p_circle and circle_scope for update;
 if p.id is null or not public.prayer_access(p.id) then raise exception 'Request unavailable' using errcode='42501';end if;
 if p_operation='prayer-save' then
  if a<>p.author_id or p.status not in ('open','answered') then raise exception 'Not authorized' using errcode='42501';end if;
  if (p_data->>'revision')::integer is distinct from p.revision then raise exception 'Request changed' using errcode='40001';end if;
  if not private.space_text(p_data->>'title',120) or not private.space_text(p_data->>'body',4000) or coalesce(p_data->>'visibility','') not in ('private','leaders','community') or p_data->>'prayer_update' is null or p_data->>'testimony' is null or (p_data->>'prayer_update'<>'' and not private.space_text(p_data->>'prayer_update',4000)) or (p_data->>'testimony'<>'' and not private.space_text(p_data->>'testimony',4000)) then raise exception 'Invalid prayer' using errcode='22023';end if;
  update public.prayer_requests set title=p_data->>'title',body=p_data->>'body',visibility=p_data->>'visibility',prayer_update=p_data->>'prayer_update',testimony=p_data->>'testimony',updated_at=now() where id=p.id;
 elsif p_operation='prayer-status' then
  if p_data->>'status' not in ('open','answered','removed','hidden') or p_data->>'status' is null then raise exception 'Invalid status' using errcode='22023';end if;
  if a<>p.author_id and (private.space_rank(a,p_circle)<20 or p.visibility<>'community' or p_data->>'status' not in ('hidden','removed') or not private.space_text(p_data->>'reason',300)) then raise exception 'Not authorized' using errcode='42501';end if;
  if p_data->>'status'='hidden' and (private.space_rank(a,p_circle)<20 or p.visibility<>'community') then raise exception 'Not authorized' using errcode='42501';end if;
  update public.prayer_requests set status=p_data->>'status',updated_at=now() where id=p.id;
  if p_data->>'status'='removed' then delete from public.prayer_comments where prayer_id=p.id;delete from public.prayer_encouragements where prayer_id=p.id;end if;
  insert into private.space_audit(community_id,actor_id,resource_id,action,reason)values(p_circle,a,p.id,'faith-prayer-'||(p_data->>'status'),coalesce(p_data->>'reason',''));
 elsif p_operation in ('comment-save','comment-remove') then
  if p.status not in ('open','answered') then raise exception 'Request unavailable' using errcode='42501';end if;
  item:=(p_data->>'id')::uuid;select * into v from public.prayer_comments where id=item;
  if v.id is not null and (v.prayer_id<>p.id or private.squad_blocked(a,v.author_id)) then raise exception 'Unavailable' using errcode='42501';end if;
  if p_operation='comment-save' then
   if not private.space_text(p_data->>'body',2000) or (v.id is not null and v.author_id<>a) then raise exception 'Not authorized' using errcode='42501';end if;
   if v.id is null then
    if not public.space_budget('comment') then return jsonb_build_object('limited',true);end if;
    insert into public.prayer_comments(id,prayer_id,author_id,body)values(item,p.id,a,p_data->>'body');
   else update public.prayer_comments set body=p_data->>'body' where id=item;end if;
  else
   if v.id is null or (v.author_id<>a and not (p.visibility='community' and private.space_rank(a,p_circle)>=20)) then raise exception 'Not authorized' using errcode='42501';end if;
   if v.author_id<>a and not private.space_text(p_data->>'reason',300) then raise exception 'Reason required' using errcode='22023';end if;
   delete from public.prayer_comments where id=item;insert into private.space_audit(community_id,actor_id,resource_id,action,reason)values(p_circle,a,item,'faith-comment-remove',coalesce(p_data->>'reason',''));
  end if;
 elsif p_operation='encourage' then
  if p.status not in ('open','answered') or jsonb_typeof(p_data->'enabled') is distinct from 'boolean' then raise exception 'Unavailable' using errcode='42501';end if;
  if (p_data->>'enabled')::boolean then insert into public.prayer_encouragements values(p.id,a)on conflict do nothing;else delete from public.prayer_encouragements where prayer_id=p.id and user_id=a;end if;
 elsif p_operation='report' then
  if p.visibility<>'community' or not private.space_text(p_data->>'reason',500) then raise exception 'Report unavailable' using errcode='42501';end if;
  if not private.take_limit('faith-prayer-report:'||a::text,10,3600) then return jsonb_build_object('limited',true);end if;
  item:=nullif(p_data->>'comment','')::uuid;
  if item is not null and not exists(select 1 from public.prayer_comments where id=item and prayer_id=p.id and not private.squad_blocked(a,author_id)) then raise exception 'Comment unavailable' using errcode='42501';end if;
  insert into private.faith_prayer_reports(circle_id,prayer_id,comment_id,target_comment_id,subject_id,reporter_id,reason)values(p_circle,p.id,item,item,coalesce((select author_id from public.prayer_comments where id=item),p.author_id),a,p_data->>'reason') on conflict do nothing;
 else raise exception 'Invalid operation' using errcode='22023';end if;
 return jsonb_build_object('ok',true,'id',p.id);
end$$;
create function public.faith_conversation_read(p_circle uuid,p_view text default 'channels',p_resource uuid default null,p_after uuid default null,p_size integer default 20) returns jsonb language plpgsql security definer set search_path='' as $$
declare items jsonb;p public.prayer_requests;begin
 if not public.faith_member_access(p_circle) then raise exception 'Unavailable' using errcode='42501';end if;
 if p_size is null or p_size not between 1 and 40 then raise exception 'Invalid page' using errcode='22023';end if;
 if not private.take_limit('faith-conversation-read:'||auth.uid()::text,180,60) then return jsonb_build_object('limited',true);end if;
 if p_view='channels' then
  return jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'purpose',d.purpose)order by d.purpose)from public.faith_discussion_channels d join public.channels c on c.id=d.channel_id where d.circle_id=p_circle and c.community_id=p_circle and public.channel_access(c.id)),'[]'),
  'available',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name))from(select * from public.channels where community_id=p_circle and kind='text' and public.channel_access(id) order by position,id limit 100)c),'[]'),
  'can_manage',private.community_rank(p_circle)>=30,'can_moderate',private.space_rank(auth.uid(),p_circle)>=20,
  'replies',coalesce((select replies from public.faith_prayer_preferences where circle_id=p_circle and user_id=auth.uid()),true));
 elsif p_view='prayers' then
  select coalesce(jsonb_agg(private.prayer_dto(q)order by q.id),'[]')into items from(select * from public.prayer_requests where community_id=p_circle and circle_scope and status<>'removed' and public.prayer_access(id) and (p_after is null or id>p_after) order by id limit p_size+1)q;return jsonb_build_object('items',items);
 elsif p_view in ('prayer','comments') then
  select * into p from public.prayer_requests where id=p_resource and community_id=p_circle and circle_scope and public.prayer_access(id);
  if p.id is null then raise exception 'Unavailable' using errcode='42501';end if;
  if p_view='prayer' then return private.prayer_dto(p);end if;
  select coalesce(jsonb_agg(to_jsonb(q)||jsonb_build_object('author_name',(select display_name from public.profiles where id=q.author_id),'username',(select username from public.profiles where id=q.author_id),'avatar',exists(select 1 from public.profiles where id=q.author_id and avatar_path is not null),'own',q.author_id=auth.uid())order by q.id),'[]')into items from(select * from public.prayer_comments where prayer_id=p.id and private.squad_live(author_id) and not private.squad_blocked(auth.uid(),author_id) and (p_after is null or id>p_after)order by id limit p_size+1)q;return jsonb_build_object('items',items);
 elsif p_view='reports' then
  if private.space_rank(auth.uid(),p_circle)<20 then raise exception 'Unavailable' using errcode='42501';end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'prayer_id',r.prayer_id,'comment_id',r.target_comment_id,'reason',r.reason,'status',r.status,'created_at',r.created_at,'can_review',r.can_review)order by r.id),'[]')into items from(select r.*,r.reporter_id is distinct from auth.uid() and r.subject_id is distinct from auth.uid() and pr.author_id<>auth.uid() can_review from private.faith_prayer_reports r join public.prayer_requests pr on pr.id=r.prayer_id where r.circle_id=p_circle and pr.visibility='community' and public.prayer_access(pr.id) and r.retain_until>now() and (p_after is null or r.id>p_after)order by r.id limit p_size+1)r;return jsonb_build_object('items',items);
 else raise exception 'Invalid view' using errcode='22023';end if;
end$$;
alter table public.faith_discussion_channels enable row level security;
alter table public.faith_session_discussions enable row level security;
alter table public.faith_prayer_preferences enable row level security;
alter table private.faith_prayer_reports enable row level security;
revoke all on public.faith_discussion_channels,public.faith_session_discussions,public.faith_prayer_preferences,private.faith_prayer_reports from public,anon,authenticated;
grant select on public.faith_discussion_channels,public.faith_session_discussions,public.faith_prayer_preferences to authenticated;
create policy faith_channels_read on public.faith_discussion_channels for select to authenticated using(public.faith_member_access(circle_id) and public.channel_access(channel_id));
create policy faith_session_discussion_read on public.faith_session_discussions for select to authenticated using(exists(select 1 from public.bible_study_sessions s join public.bible_studies st on st.id=s.study_id join public.messages m on m.id=message_id where s.id=session_id and public.faith_room_access(st.circle_id,st.id,s.id) and public.channel_access(m.channel_id)));
create policy faith_prayer_preferences_own on public.faith_prayer_preferences for select to authenticated using(user_id=auth.uid() and public.faith_member_access(circle_id));
create function public.faith_prayer_comment_access(p_comment uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.prayer_comments c where c.id=p_comment and private.prayer_allowed(auth.uid(),c.prayer_id) and not private.squad_blocked(auth.uid(),c.author_id) and private.squad_live(c.author_id))$$;
revoke all on function public.faith_prayer_comment_access(uuid) from public,anon,authenticated;
grant execute on function public.faith_prayer_comment_access(uuid) to authenticated;
create policy faith_comments_blocks on public.prayer_comments as restrictive for select to authenticated using(public.faith_prayer_comment_access(id));
revoke all on function private.faith_prayer_member(uuid,uuid),private.faith_prayer_leader(uuid,uuid),private.faith_prayer_guard(),private.faith_prayer_notify(uuid,uuid),private.faith_prayer_comment_guard() from public,anon,authenticated;
revoke all on function public.faith_conversation_read(uuid,text,uuid,uuid,integer),public.faith_conversation_command(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.faith_conversation_read(uuid,text,uuid,uuid,integer),public.faith_conversation_command(uuid,text,jsonb) to authenticated;
notify pgrst,'reload schema';

CREATE OR REPLACE FUNCTION public.space_read(p_view text, p_resource uuid DEFAULT NULL::uuid, p_community uuid DEFAULT NULL::uuid, p_before bigint DEFAULT NULL::bigint, p_filter text DEFAULT 'all'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  select coalesce(jsonb_agg(private.prayer_dto(q) order by q.seq desc),'[]') into result from(select * from public.prayer_requests where community_id=p_community and not circle_scope and public.prayer_access(id) and (p_before is null or seq<p_before) order by seq desc limit 20)q;return jsonb_build_object('items',result);
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
end $function$
;

CREATE OR REPLACE FUNCTION public.faith_backend_read(p_view text, p_circle uuid, p_resource uuid DEFAULT NULL::uuid, p_after uuid DEFAULT NULL::uuid, p_size integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
declare result jsonb;st public.bible_studies;t public.bible_study_sessions;position integer;begin
 if p_size is null or p_size not between 1 and 40 then raise exception 'Invalid page' using errcode='22023';end if;
 if (p_view='my-request' and not private.faith_circle_allowed(p_circle)) or (p_view<>'my-request' and not public.faith_member_access(p_circle)) then raise exception 'Unavailable' using errcode='42501';end if;
 if not private.take_limit('faith-study-read:'||auth.uid()::text,180,60) then return jsonb_build_object('limited',true);end if;
 if p_view in ('studies','published-studies') then
  select coalesce(jsonb_agg(to_jsonb(q) order by q.id),'[]') into result from(select * from public.bible_studies where circle_id=p_circle and (p_view<>'published-studies' or status='published') and public.faith_study_access(id) and (p_after is null or id>p_after) order by id limit p_size+1)q;
 elsif p_view='sessions' then
  select * into st from public.bible_studies where id=p_resource and circle_id=p_circle and public.faith_study_access(id);
  if not found then raise exception 'Unavailable' using errcode='42501';end if;
  if p_after is not null then select session_number into position from public.bible_study_sessions where id=p_after and study_id=st.id and public.faith_session_access(id);if not found then raise exception 'Invalid cursor' using errcode='22023';end if;end if;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.session_number),'[]') into result from(select * from public.bible_study_sessions where study_id=st.id and public.faith_session_access(id) and (p_after is null or session_number>position) order by session_number limit p_size+1)q;
 elsif p_view in ('questions','responses','progress') then
  select x.* into t from public.bible_study_sessions x join public.bible_studies s on s.id=x.study_id where x.id=p_resource and s.circle_id=p_circle and public.faith_session_access(x.id);
  if not found then raise exception 'Unavailable' using errcode='42501';end if;
  if p_view='questions' then
   if p_after is not null then select display_order into position from public.study_questions where id=p_after and session_id=t.id;if not found then raise exception 'Invalid cursor' using errcode='22023';end if;end if;
   select coalesce(jsonb_agg(to_jsonb(q) order by q.display_order),'[]') into result from(select * from public.study_questions where session_id=t.id and (p_after is null or display_order>position) order by display_order limit p_size+1)q;
  elsif p_view='responses' then
   select coalesce(jsonb_agg(to_jsonb(q) order by q.id),'[]') into result from(select * from public.study_responses where session_id=t.id and public.faith_response_access(id) and (p_after is null or id>p_after) order by id limit p_size+1)q;
  else select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from public.study_progress q where session_id=t.id and user_id=auth.uid();end if;
 elsif p_view='prayers' then
  select coalesce(jsonb_agg(private.prayer_dto(q) order by q.id),'[]') into result from(select * from public.prayer_requests where community_id=p_circle and not circle_scope and public.prayer_access(id) and (p_after is null or id>p_after) order by id limit p_size+1)q;
 elsif p_view='members' then
  select coalesce(jsonb_agg(jsonb_build_object('id',q.user_id,'circle_id',q.circle_id,'user_id',q.user_id,'role',q.role,'joined_at',q.joined_at,'name',p.display_name) order by q.user_id),'[]') into result from(select * from public.faith_circle_members where circle_id=p_circle and private.squad_live(user_id) and not private.squad_blocked(auth.uid(),user_id) and (p_after is null or user_id>p_after) order by user_id limit p_size+1)q join public.profiles p on p.id=q.user_id;
 elsif p_view='my-request' then
  select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from public.faith_circle_join_requests q where circle_id=p_circle and user_id=auth.uid();
 elsif p_view='requests' then
  if private.community_rank(p_circle)<30 then raise exception 'Unavailable' using errcode='42501';end if;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.id),'[]') into result from(select * from public.faith_circle_join_requests where circle_id=p_circle and status='pending' and private.squad_live(user_id) and not private.squad_blocked(auth.uid(),user_id) and (p_after is null or id>p_after) order by id limit p_size+1)q;
 else raise exception 'Invalid view' using errcode='22023';end if;
 return jsonb_build_object('items',result);
end$function$
;

CREATE OR REPLACE FUNCTION public.moderation_cleanup()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare n integer;begin
 delete from private.case_media m using private.moderation_cases c where c.id=m.case_id and c.retain_until<=now();
 update private.moderation_cases set evidence=null,reason='Report details expired' where retain_until<=now() and (evidence is not null or reason<>'Report details expired');get diagnostics n=row_count;
 update public.moderation_appeals set body='Appeal details expired',decision=null where created_at<now()-interval '365 days' and status<>'pending';delete from private.faith_prayer_reports where retain_until<=now();return n;end$function$
;

CREATE OR REPLACE FUNCTION public.space_command(p_operation text, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=auth.uid();target uuid;cid uuid;item uuid;p public.prayer_requests;e public.events;g public.gaming_sessions;ci public.community_notification_invitations;gi public.gaming_session_invitations;t text;kind_value text;starts timestamptz;ends timestamptz;tz text;old_revision integer;pref jsonb;field text;member_row record;begin
 if not private.squad_live(actor) then raise exception 'Not authorized' using errcode='42501';end if;
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
$migration$;
  INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('202611210001','faith_conversation_prayer',ARRAY[]::text[]);
 END IF;
END $install$;
COMMIT;
