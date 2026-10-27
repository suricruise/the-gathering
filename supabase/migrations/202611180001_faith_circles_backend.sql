-- Phase 2: additive studies and structured reflections. Community membership stays authoritative.
-- Auth deletion may fire FK updates after its actor row is gone. Preserve a system audit safely.
create or replace function private.faith_circle_audit() returns trigger language plpgsql security definer set search_path='' as $$begin
 insert into public.community_audit_log(community_id,actor_id,target_id,action,detail) values(new.community_id,(select id from auth.users where id=auth.uid()),(select id from auth.users where id=new.leader_id),'faith_circle_settings',jsonb_build_object('enabled',new.enabled,'featured',new.featured,'leader',new.leader_id,'source',case when exists(select 1 from auth.users where id=auth.uid()) then 'authenticated' else 'trusted_operator' end));
 return new;
end$$;

alter table public.faith_circles add column created_by uuid default auth.uid() references auth.users(id) on delete set null;
create or replace function private.faith_circle_validate() returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_op='UPDATE' and new.community_id<>old.community_id then raise exception 'Circle association cannot be moved' using errcode='22023';end if;
 -- Clearing historical attribution must not prevent Auth deletion when current leadership is revoked.
 if tg_op='UPDATE' and old.created_by is not null and new.created_by is null
 and (to_jsonb(new)-'created_by'-'updated_at')=(to_jsonb(old)-'created_by'-'updated_at') then
  new.updated_at:=now();return new;
 end if;
 if new.leader_id is null then
  if tg_op='INSERT' then raise exception 'An approved current leader is required' using errcode='22023';end if;
  -- Auth deletion must not delete a community or block account cleanup.
  new.enabled:=false;
 elsif new.enabled and (not exists(select 1 from private.faith_circle_leaders where user_id=new.leader_id and approved) or private.space_rank(new.leader_id,new.community_id)<10) then
  raise exception 'An approved current community leader is required' using errcode='42501';
 end if;
 if new.discussion_channel_id is not null and not exists(select 1 from public.channels where id=new.discussion_channel_id and community_id=new.community_id and kind='text') then raise exception 'Invalid Circle discussion channel' using errcode='22023';end if;
 if new.hangout_channel_id is not null and not exists(select 1 from public.channels where id=new.hangout_channel_id and community_id=new.community_id and kind='voice') then raise exception 'Invalid Circle Hangout' using errcode='22023';end if;
 new.updated_at:=now();return new;
end$$;

create table private.faith_co_leaders(
 circle_id uuid not null references public.faith_circles(community_id) on delete cascade,
 user_id uuid not null,assigned_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),primary key(circle_id,user_id),
 foreign key(circle_id,user_id) references public.community_members(community_id,user_id) on delete cascade
);
create table public.faith_circle_join_requests(
 id uuid primary key default gen_random_uuid(),circle_id uuid not null references public.faith_circles(community_id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 status text not null default 'pending' check(status in ('pending','accepted','declined','cancelled')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(circle_id,user_id)
);
create index circle_requests_page on public.faith_circle_join_requests(circle_id,status,id);
create index circle_requests_user on public.faith_circle_join_requests(user_id,circle_id);
create table public.bible_studies(
 id uuid primary key default gen_random_uuid(),circle_id uuid not null references public.faith_circles(community_id) on delete cascade,
 title text not null check(private.space_text(title,120)),description text not null default '' check(length(description)<=4000),
 cover_image text not null default 'nebula' check(cover_image in ('nebula','aurora','ember','ocean')),
 created_by uuid default auth.uid() references auth.users(id) on delete set null,
 duration_days integer not null default 7 check(duration_days between 1 and 366),
 status text not null default 'draft' check(status in ('draft','published','archived')),
 rights_confirmed boolean not null default false,revision integer not null default 1 check(revision>0),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index bible_studies_circle on public.bible_studies(circle_id,status,id);
create index bible_studies_creator on public.bible_studies(created_by);
create table public.bible_study_sessions(
 id uuid primary key default gen_random_uuid(),study_id uuid not null references public.bible_studies(id) on delete cascade,
 session_number integer not null check(session_number between 1 and 366),title text not null check(private.space_text(title,120)),
 scripture_reference text not null check(length(scripture_reference)<=100 and scripture_reference ~ '^[1-4]? ?[A-Za-z]+( [A-Za-z]+){0,3} [1-9][0-9]{0,2}(:[1-9][0-9]{0,2}(-[1-9][0-9]{0,2})?)?$'),
 teaching_content text not null default '' check(length(teaching_content)<=20000),application_challenge text not null default '' check(length(application_challenge)<=4000),
 prayer_prompt text not null default '' check(length(prayer_prompt)<=4000),release_at timestamptz,
 created_at timestamptz not null default now(),unique(study_id,session_number)
);
create table public.study_questions(
 id uuid primary key default gen_random_uuid(),session_id uuid not null references public.bible_study_sessions(id) on delete cascade,
 question_text text not null check(private.space_text(question_text,2000)),display_order integer not null check(display_order between 0 and 49),
 unique(session_id,display_order),unique(id,session_id)
);
create table public.study_responses(
 id uuid primary key default gen_random_uuid(),session_id uuid not null references public.bible_study_sessions(id) on delete cascade,
 question_id uuid not null,author_id uuid not null references auth.users(id) on delete cascade,
 response_text text not null check(length(response_text)<=8000),audience text not null default 'private' check(audience in ('private','circle')),
 revision integer not null default 1 check(revision>0),hidden_at timestamptz,removed_at timestamptz,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(question_id,session_id) references public.study_questions(id,session_id) on delete cascade,
 unique(author_id,question_id),check(removed_at is not null or private.space_text(response_text,8000))
);
create index study_responses_session on public.study_responses(session_id,id);
create index study_responses_question on public.study_responses(question_id,session_id);
create table public.study_progress(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 session_id uuid not null references public.bible_study_sessions(id) on delete cascade,
 completed_at timestamptz not null default now(),study_revision integer not null check(study_revision>0),unique(user_id,session_id)
);
create index study_progress_session on public.study_progress(session_id);
create index prayer_circle_uuid_page on public.prayer_requests(community_id,id);
alter table public.prayer_requests add column title text not null default '' check(length(title)<=120);
create function private.faith_prayer_title_guard() returns trigger language plpgsql set search_path='' as $$begin
 if new.status='removed' then new.title:='';end if;return new;end$$;
create trigger faith_prayer_title_guard before update on public.prayer_requests for each row execute function private.faith_prayer_title_guard();
create function private.faith_role_membership_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.status<>'active' then delete from private.faith_co_leaders where circle_id=new.community_id and user_id=new.user_id;end if;return new;end$$;
create trigger faith_role_membership_guard after update of status on public.community_members for each row execute function private.faith_role_membership_guard();
-- No independent membership or authentication store. This view is projected only through authorized RPCs.
create view public.faith_circle_members with(security_invoker=true) as
 select m.community_id circle_id,m.user_id,m.joined_at,
 case when m.user_id=f.leader_id then 'leader' when l.user_id is not null and a.approved then 'co_leader' else 'member' end role
 from public.community_members m join public.faith_circles f on f.community_id=m.community_id
 left join private.faith_co_leaders l on l.circle_id=m.community_id and l.user_id=m.user_id
 left join private.faith_circle_leaders a on a.user_id=l.user_id
 where m.status='active';

create function private.faith_editor(cid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.faith_circle_allowed(cid) and private.community_rank(cid)>0
 and exists(select 1 from private.faith_circle_leaders where user_id=auth.uid() and approved)
 and (private.community_rank(cid)>=30 or exists(select 1 from public.faith_circles where community_id=cid and leader_id=auth.uid())
 or exists(select 1 from private.faith_co_leaders where circle_id=cid and user_id=auth.uid()));
$$;
create function public.faith_study_access(p_study uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.bible_studies s where s.id=p_study and private.faith_circle_allowed(s.circle_id) and private.community_rank(s.circle_id)>0
 and ((s.status='published' and private.squad_live(s.created_by) and not private.squad_blocked(auth.uid(),s.created_by)) or private.faith_editor(s.circle_id)));
$$;
create function public.faith_session_access(p_session uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.bible_study_sessions t join public.bible_studies s on s.id=t.study_id where t.id=p_session and public.faith_study_access(s.id)
 and (private.faith_editor(s.circle_id) or (s.status='published' and (t.release_at is null or t.release_at<=now()))));
$$;
create function public.faith_response_access(p_response uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.study_responses r where r.id=p_response and public.faith_session_access(r.session_id)
 and private.squad_live(r.author_id) and not private.squad_blocked(auth.uid(),r.author_id)
 and (r.author_id=auth.uid() or (r.audience='circle' and r.removed_at is null and (r.hidden_at is null or exists(select 1 from public.bible_study_sessions t join public.bible_studies s on s.id=t.study_id where t.id=r.session_id and private.community_rank(s.circle_id)>=20)))));
$$;
create function public.faith_member_access(p_circle uuid) returns boolean language sql stable security definer set search_path='' as $$select private.faith_circle_allowed(p_circle) and private.community_rank(p_circle)>0$$;

alter table private.faith_co_leaders enable row level security;
alter table public.faith_circle_join_requests enable row level security;
alter table public.bible_studies enable row level security;
alter table public.bible_study_sessions enable row level security;
alter table public.study_questions enable row level security;
alter table public.study_responses enable row level security;
alter table public.study_progress enable row level security;
revoke all on private.faith_co_leaders,public.faith_circle_members,public.faith_circle_join_requests,public.bible_studies,public.bible_study_sessions,public.study_questions,public.study_responses,public.study_progress from public,anon,authenticated;
grant select on public.bible_studies,public.bible_study_sessions,public.study_questions,public.study_responses,public.study_progress to authenticated;
create policy bible_studies_read on public.bible_studies for select to authenticated using(public.faith_study_access(id));
create policy bible_sessions_read on public.bible_study_sessions for select to authenticated using(public.faith_session_access(id));
create policy study_questions_read on public.study_questions for select to authenticated using(public.faith_session_access(session_id));
create policy study_responses_read on public.study_responses for select to authenticated using(public.faith_response_access(id));
create policy study_progress_read on public.study_progress for select to authenticated using(user_id=auth.uid() and public.faith_session_access(session_id));
-- Permission checks live in the transaction. All writes share existing administration/community locks.
create function public.faith_backend_command(p_operation text,p_circle uuid,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare actor uuid:=auth.uid();f public.faith_circles;s public.bible_studies;t public.bible_study_sessions;r public.study_responses;
 cid uuid;item uuid;target uuid;v jsonb;existing jsonb;operation_text text;begin
 if not private.squad_live(actor) then raise exception 'Unavailable' using errcode='42501';end if;
 if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>60000 or p_data ?| array['actor','author_id','user_id','role','created_by','approved'] then raise exception 'Invalid input' using errcode='22023';end if;
 if not private.take_limit('faith-write:'||actor::text,60,60) then return jsonb_build_object('limited',true);end if;
 perform pg_advisory_xact_lock(20261030);
 perform 1 from public.communities where id=p_circle and not archived for update;
 if not found then raise exception 'Unavailable' using errcode='42501';end if;
 if p_operation='circle-create' then
  if private.community_rank(p_circle)<30 or not exists(select 1 from private.faith_circle_leaders where user_id=actor and approved) then raise exception 'Unavailable' using errcode='42501';end if;
  insert into public.faith_circles(community_id,leader_id,created_by,discussion_channel_id,hangout_channel_id)
  values(p_circle,actor,actor,(p_data->>'discussion')::uuid,(p_data->>'hangout')::uuid) on conflict do nothing;
  if not exists(select 1 from public.faith_circles where community_id=p_circle and leader_id=actor) then raise exception 'Unavailable' using errcode='42501';end if;
  return jsonb_build_object('id',p_circle);
 end if;
 select * into f from public.faith_circles where community_id=p_circle for update;
 if not found then raise exception 'Unavailable' using errcode='42501';end if;
 if p_operation='accept-invite' then
  if not f.enabled or not private.squad_live(f.leader_id) or private.squad_blocked(actor,f.leader_id) or not exists(select 1 from private.faith_circle_leaders where user_id=f.leader_id and approved) then raise exception 'Unavailable' using errcode='42501';end if;
  v:=public.community_command('accept_invite',p_circle,jsonb_build_object('token',p_data->>'token'));
  if (v->>'id')::uuid is distinct from p_circle or not private.faith_circle_allowed(p_circle) then raise exception 'Unavailable' using errcode='42501';end if;return jsonb_build_object('id',p_circle);
 end if;
 if not private.faith_circle_allowed(p_circle) then raise exception 'Unavailable' using errcode='42501';end if;
 if p_operation='join' then
  perform public.community_command('join',p_circle);return jsonb_build_object('id',p_circle);
 elsif p_operation='join-request' then
  if private.community_rank(p_circle)>0 then return jsonb_build_object('id',p_circle);end if;
  if not exists(select 1 from public.communities where id=p_circle and visibility='discoverable') then raise exception 'Use an invitation' using errcode='42501';end if;
  insert into public.faith_circle_join_requests(circle_id,user_id)values(p_circle,actor)
  on conflict(circle_id,user_id)do update set status='pending',updated_at=now() where faith_circle_join_requests.status in ('declined','cancelled','accepted');return jsonb_build_object('id',p_circle);
 elsif p_operation='request-cancel' then
  update public.faith_circle_join_requests set status='cancelled',updated_at=now() where circle_id=p_circle and user_id=actor and status='pending';return jsonb_build_object('id',p_circle,'ok',true);
 end if;
 if private.community_rank(p_circle)=0 then raise exception 'Unavailable' using errcode='42501';end if;
 if p_operation='leave' then perform public.community_command('leave',p_circle);return jsonb_build_object('id',p_circle);
 elsif p_operation='request-decide' then
  target:=(p_data->>'target')::uuid;
  if private.community_rank(p_circle)<30 or target=actor or not private.squad_live(target) or private.squad_blocked(actor,target) or private.squad_blocked(f.leader_id,target)
  or exists(select 1 from public.community_members where community_id=p_circle and user_id=target and status='banned') then raise exception 'Unavailable' using errcode='42501';end if;
  perform 1 from public.faith_circle_join_requests where circle_id=p_circle and user_id=target and status='pending' for update;
  if not found then raise exception 'Unavailable' using errcode='42501';end if;
  if coalesce((p_data->>'accept')::boolean,false) then
   insert into public.community_members(community_id,user_id)values(p_circle,target)on conflict do nothing;
   operation_text:='accepted';else operation_text:='declined';end if;
  update public.faith_circle_join_requests set status=operation_text,updated_at=now() where circle_id=p_circle and user_id=target;
 elsif p_operation='co-leader' then
  target:=(p_data->>'target')::uuid;
  if private.community_rank(p_circle)<30 or target=actor or target=f.leader_id or private.space_rank(target,p_circle)=0 or private.squad_blocked(actor,target) then raise exception 'Unavailable' using errcode='42501';end if;
  if (p_data->>'enabled')::boolean then
   if not exists(select 1 from private.faith_circle_leaders where user_id=target and approved) then raise exception 'Approval required' using errcode='42501';end if;
   insert into private.faith_co_leaders(circle_id,user_id,assigned_by)values(p_circle,target,actor)on conflict do nothing;
  else delete from private.faith_co_leaders where circle_id=p_circle and user_id=target;end if;
 elsif p_operation='study-create' then
  if not private.faith_editor(p_circle) then raise exception 'Unavailable' using errcode='42501';end if;
  item:=(p_data->>'id')::uuid;
  if (select count(*) from public.bible_studies where circle_id=p_circle and status<>'archived')>=100 and not exists(select 1 from public.bible_studies where id=item and circle_id=p_circle and created_by=actor) then raise exception 'Study limit' using errcode='22023';end if;
  insert into public.bible_studies(id,circle_id,title,description,cover_image,created_by,duration_days)
  values(item,p_circle,p_data->>'title',coalesce(p_data->>'description',''),coalesce(p_data->>'cover','nebula'),actor,(p_data->>'duration_days')::integer) on conflict do nothing;
  if not exists(select 1 from public.bible_studies where id=item and circle_id=p_circle and created_by=actor) then raise exception 'Unavailable' using errcode='42501';end if;return jsonb_build_object('id',item);
 elsif p_operation in ('study-update','study-publish','study-archive','session-save','question-save') then
  if not private.faith_editor(p_circle) then raise exception 'Unavailable' using errcode='42501';end if;
  select * into s from public.bible_studies where id=(p_data->>'study')::uuid and circle_id=p_circle for update;
  if not found then raise exception 'Unavailable' using errcode='42501';end if;
  if s.revision is distinct from (p_data->>'revision')::integer then raise exception 'Revision changed' using errcode='40001';end if;
  if p_operation='study-publish' then
   if s.status<>'draft' or p_data->>'rights_confirmed' is distinct from 'true' or not exists(select 1 from public.bible_study_sessions where study_id=s.id)
   or exists(select 1 from public.bible_study_sessions t where t.study_id=s.id and (not private.space_text(t.teaching_content,20000) or not private.space_text(t.application_challenge,4000) or not private.space_text(t.prayer_prompt,4000) or not exists(select 1 from public.study_questions where session_id=t.id))) then raise exception 'Complete the study and confirm content rights' using errcode='22023';end if;
   update public.bible_studies set status='published',rights_confirmed=true where id=s.id;
  elsif p_operation='study-archive' then update public.bible_studies set status='archived' where id=s.id;
  else
   if s.status<>'draft' then raise exception 'Published studies are immutable; create a new edition' using errcode='22023';end if;
   if p_operation='study-update' then
    update public.bible_studies set title=p_data->>'title',description=p_data->>'description',duration_days=(p_data->>'duration_days')::integer,cover_image=p_data->>'cover' where id=s.id;
   elsif p_operation='session-save' then
    item:=(p_data->>'id')::uuid;
    if exists(select 1 from public.bible_study_sessions where id=item and study_id<>s.id) then raise exception 'Unavailable' using errcode='42501';end if;
    insert into public.bible_study_sessions(id,study_id,session_number,title,scripture_reference,teaching_content,application_challenge,prayer_prompt,release_at)
    values(item,s.id,(p_data->>'session_number')::integer,p_data->>'title',p_data->>'scripture_reference',p_data->>'teaching_content',p_data->>'application_challenge',p_data->>'prayer_prompt',(p_data->>'release_at')::timestamptz)
    on conflict(id)do update set session_number=excluded.session_number,title=excluded.title,scripture_reference=excluded.scripture_reference,teaching_content=excluded.teaching_content,application_challenge=excluded.application_challenge,prayer_prompt=excluded.prayer_prompt,release_at=excluded.release_at;
   else
    item:=(p_data->>'id')::uuid;target:=(p_data->>'session')::uuid;
    if not exists(select 1 from public.bible_study_sessions where id=target and study_id=s.id) or exists(select 1 from public.study_questions where id=item and session_id<>target) then raise exception 'Unavailable' using errcode='42501';end if;
    insert into public.study_questions(id,session_id,question_text,display_order)values(item,target,p_data->>'question_text',(p_data->>'display_order')::integer)
    on conflict(id)do update set question_text=excluded.question_text,display_order=excluded.display_order;
   end if;
  end if;
  update public.bible_studies set revision=revision+1,updated_at=now() where id=s.id returning revision into s.revision;
  insert into public.community_audit_log(community_id,actor_id,action,detail)values(p_circle,actor,'faith.'||p_operation,jsonb_build_object('study',s.id,'revision',s.revision));
  return jsonb_build_object('id',coalesce(item,s.id),'revision',s.revision);
 elsif p_operation in ('progress-save','response-save','response-remove','response-moderate') then
  if p_operation in ('response-remove','response-moderate') then
   select * into r from public.study_responses where id=(p_data->>'id')::uuid for update;
   target:=r.session_id;
  else target:=(p_data->>'session')::uuid;end if;
  select x.* into t from public.bible_study_sessions x join public.bible_studies st on st.id=x.study_id where x.id=target and st.circle_id=p_circle and st.status='published';
  if not found or not public.faith_session_access(t.id) then raise exception 'Unavailable' using errcode='42501';end if;
  if p_operation='progress-save' then
   if p_data->>'completed' is distinct from 'false' then
    insert into public.study_progress(user_id,session_id,study_revision)select actor,t.id,revision from public.bible_studies where id=t.study_id on conflict(user_id,session_id)do nothing;
   else delete from public.study_progress where user_id=actor and session_id=t.id;end if;
  elsif p_operation='response-save' then
   item:=(p_data->>'id')::uuid;
   if not exists(select 1 from public.study_questions where id=(p_data->>'question')::uuid and session_id=t.id) then raise exception 'Unavailable' using errcode='42501';end if;
   select * into r from public.study_responses where id=item for update;
   if found then
    if r.author_id<>actor or r.session_id<>t.id or r.question_id<>(p_data->>'question')::uuid or r.hidden_at is not null or r.removed_at is not null then raise exception 'Unavailable' using errcode='42501';end if;
    if r.response_text=p_data->>'response_text' and r.audience=p_data->>'audience' then return jsonb_build_object('id',r.id,'revision',r.revision);end if;
    if r.revision is distinct from (p_data->>'revision')::integer then raise exception 'Revision changed' using errcode='40001';end if;
    update public.study_responses set response_text=p_data->>'response_text',audience=p_data->>'audience',revision=revision+1,updated_at=now() where id=r.id returning * into r;
   else
    insert into public.study_responses(id,session_id,question_id,author_id,response_text,audience)values(item,t.id,(p_data->>'question')::uuid,actor,p_data->>'response_text',coalesce(p_data->>'audience','private')) returning * into r;
   end if;return jsonb_build_object('id',r.id,'revision',r.revision);
  elsif p_operation='response-remove' then
   if r.author_id is distinct from actor then raise exception 'Unavailable' using errcode='42501';end if;
   update public.study_responses set response_text='',audience='private',removed_at=coalesce(removed_at,now()),updated_at=now(),revision=revision+1 where id=r.id;
  else
   if private.community_rank(p_circle)<20 or r.audience<>'circle' or not public.faith_response_access(r.id) or not private.space_text(p_data->>'reason',300) then raise exception 'Unavailable' using errcode='42501';end if;
   update public.study_responses set hidden_at=now(),updated_at=now(),revision=revision+1 where id=r.id;
   insert into public.community_audit_log(community_id,actor_id,target_id,action,detail)values(p_circle,actor,r.author_id,'faith.response-moderate',jsonb_build_object('response',r.id,'reason',p_data->>'reason'));
  end if;
  return jsonb_build_object('id',coalesce(item,t.id),'ok',true);
 elsif p_operation='prayer-create' then
  item:=(p_data->>'id')::uuid;
  if not private.space_text(p_data->>'title',120) then raise exception 'Invalid title' using errcode='22023';end if;
  v:=public.space_command('prayer-create',jsonb_build_object('id',item,'community',p_circle,'body',p_data->>'content','visibility',p_data->>'visibility','guidelines',p_data->'guidelines'));
  if v->>'limited'='true' then return v;end if;
  -- A retry cannot change an already existing request's content or visibility.
  if not exists(select 1 from public.prayer_requests where id=item and author_id=actor and community_id=p_circle and body=p_data->>'content' and visibility=p_data->>'visibility' and title in ('',p_data->>'title')) then raise exception 'Request changed' using errcode='40001';end if;
  update public.prayer_requests set title=p_data->>'title' where id=item and author_id=actor;return jsonb_build_object('id',item);
 else raise exception 'Invalid operation' using errcode='22023';end if;
 insert into public.community_audit_log(community_id,actor_id,target_id,action,detail)values(p_circle,actor,target,'faith.'||p_operation,'{}');
 return jsonb_build_object('id',p_circle,'ok',true);
end$$;

create function public.faith_backend_read(p_view text,p_circle uuid,p_resource uuid default null,p_after uuid default null,p_size integer default 20) returns jsonb language plpgsql security definer set search_path='' as $$
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
  select coalesce(jsonb_agg(private.prayer_dto(q) order by q.id),'[]') into result from(select * from public.prayer_requests where community_id=p_circle and public.prayer_access(id) and (p_after is null or id>p_after) order by id limit p_size+1)q;
 elsif p_view='members' then
  select coalesce(jsonb_agg(jsonb_build_object('id',q.user_id,'circle_id',q.circle_id,'user_id',q.user_id,'role',q.role,'joined_at',q.joined_at,'name',p.display_name) order by q.user_id),'[]') into result from(select * from public.faith_circle_members where circle_id=p_circle and private.squad_live(user_id) and not private.squad_blocked(auth.uid(),user_id) and (p_after is null or user_id>p_after) order by user_id limit p_size+1)q join public.profiles p on p.id=q.user_id;
 elsif p_view='my-request' then
  select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from public.faith_circle_join_requests q where circle_id=p_circle and user_id=auth.uid();
 elsif p_view='requests' then
  if private.community_rank(p_circle)<30 then raise exception 'Unavailable' using errcode='42501';end if;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.id),'[]') into result from(select * from public.faith_circle_join_requests where circle_id=p_circle and status='pending' and private.squad_live(user_id) and not private.squad_blocked(auth.uid(),user_id) and (p_after is null or id>p_after) order by id limit p_size+1)q;
 else raise exception 'Invalid view' using errcode='22023';end if;
 return jsonb_build_object('items',result);
end$$;
revoke all on function private.faith_circle_audit(),private.faith_editor(uuid),private.faith_prayer_title_guard(),private.faith_role_membership_guard() from public,anon,authenticated;
revoke all on function public.faith_study_access(uuid),public.faith_session_access(uuid),public.faith_response_access(uuid),public.faith_member_access(uuid),public.faith_backend_command(text,uuid,jsonb),public.faith_backend_read(text,uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.faith_study_access(uuid),public.faith_session_access(uuid),public.faith_response_access(uuid),public.faith_member_access(uuid),public.faith_backend_command(text,uuid,jsonb),public.faith_backend_read(text,uuid,uuid,uuid,integer) to authenticated;
notify pgrst,'reload schema';
