-- Additive visual authoring; existing published editions and member records stay intact.
alter table public.bible_studies add column intended_audience text not null default '' check(length(intended_audience)<=500), add column planned_sessions integer not null default 1 check(planned_sessions between 1 and 366);
alter table public.bible_study_sessions add column media_link text not null default '' check(length(media_link)<=2000);
create table private.faith_builder_settings(circle_id uuid primary key references public.faith_circles(community_id) on delete cascade,require_review boolean not null default false);
create table private.faith_builder_reviews(study_id uuid primary key references public.bible_studies on delete cascade,state text not null check(state in ('submitted','approved','changes_requested')),submitted_by uuid references auth.users on delete set null,reviewed_by uuid references auth.users on delete set null,reason text not null default '' check(length(reason)<=500),updated_at timestamptz not null default now());
create table private.faith_builder_audit(id bigint generated always as identity primary key,study_id uuid references public.bible_studies on delete cascade,actor_id uuid references auth.users on delete set null,action text not null,revision integer,reason text not null default '' check(length(reason)<=500),created_at timestamptz not null default now());
create index faith_builder_audit_study on private.faith_builder_audit(study_id,id desc);
create table public.faith_study_covers(study_id uuid primary key references public.bible_studies on delete cascade,object_path text not null unique,version uuid not null,bytes integer not null check(bytes between 1 and 5242880));
alter table private.faith_builder_settings enable row level security;
alter table private.faith_builder_reviews enable row level security;
alter table private.faith_builder_audit enable row level security;
alter table public.faith_study_covers enable row level security;
revoke all on private.faith_builder_settings,private.faith_builder_reviews,private.faith_builder_audit,public.faith_study_covers from public,anon,authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)values('faith-study-covers','faith-study-covers',false,5242880,array['image/webp'])on conflict(id)do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create function private.faith_builder_editor(cid uuid) returns boolean language sql stable security definer set search_path='' as $$ select private.faith_editor(cid) or (private.platform_rank()>=30 and public.faith_member_access(cid)); $$;
create function private.faith_builder_editable(sid uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.bible_studies s where s.id=sid and s.status='draft' and private.faith_builder_editor(s.circle_id) and not exists(select 1 from private.faith_builder_reviews r where r.study_id=s.id and r.state in ('submitted','approved'))); $$;
alter table public.bible_study_sessions drop constraint bible_study_sessions_study_id_session_number_key, add constraint bible_study_sessions_study_id_session_number_key unique(study_id,session_number) deferrable initially immediate;
alter table public.study_questions drop constraint study_questions_session_id_display_order_key, add constraint study_questions_session_id_display_order_key unique(session_id,display_order) deferrable initially immediate;
-- Trigger-level gates also cover older authoring RPCs, not just the new visual UI.
create function private.faith_builder_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare sid uuid; st public.bible_studies;begin
 if auth.uid() is null then return new;end if;
 if tg_table_name='bible_studies' then
  if new.status='published' and old.status<>'published' and exists(select 1 from private.faith_builder_settings where circle_id=new.circle_id and require_review) and not exists(select 1 from private.faith_builder_reviews where study_id=new.id and state='approved') then raise exception 'Review required' using errcode='42501';end if;
  if old.status<>'draft' and (to_jsonb(new)-array['status','revision','updated_at','discovery_enabled','discovery_featured','discovery_topic']) is distinct from (to_jsonb(old)-array['status','revision','updated_at','discovery_enabled','discovery_featured','discovery_topic']) then raise exception 'Published editions are immutable' using errcode='22023';end if;
  if new.discovery_featured and (not old.discovery_featured or (new.discovery_enabled and not old.discovery_enabled)) and private.platform_rank()<30 then raise exception 'Platform feature approval required' using errcode='42501';end if;
  if old.status='draft' and new.status='draft' and (to_jsonb(new)-array['revision','updated_at']) is distinct from (to_jsonb(old)-array['revision','updated_at']) and exists(select 1 from private.faith_builder_reviews where study_id=new.id and state in ('submitted','approved')) then raise exception 'Withdraw review before editing' using errcode='42501';end if;
 else
  if tg_table_name='study_questions' then select study_id into sid from public.bible_study_sessions where id=new.session_id;else sid:=new.study_id;end if;
  if not private.faith_builder_editable(sid) then raise exception 'Draft editing permission required' using errcode='42501';end if;
 end if;return new;
end$$;
create trigger faith_builder_study_guard before update on public.bible_studies for each row execute function private.faith_builder_guard();
create trigger faith_builder_session_guard before insert or update on public.bible_study_sessions for each row execute function private.faith_builder_guard();
create trigger faith_builder_question_guard before insert or update on public.study_questions for each row execute function private.faith_builder_guard();
create function public.faith_builder_read(p_circle uuid,p_study uuid default null,p_after uuid default null,p_size integer default 20,p_view text default 'studies')returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare s public.bible_studies;items jsonb;begin
 if not private.faith_builder_editor(p_circle) then raise exception 'Unavailable' using errcode='42501';end if;
 if p_size is null or p_size not between 1 and 40 or p_view not in ('studies','detail','sessions','session','audit') then raise exception 'Invalid query' using errcode='22023';end if;
 if not private.take_limit('faith-builder-read:'||auth.uid()::text,180,60)then return jsonb_build_object('limited',true);end if;
 if p_view='studies' then
 select coalesce(jsonb_agg(x order by x.id),'[]')into items from(select s.*,r.state review_state from public.bible_studies s left join private.faith_builder_reviews r on r.study_id=s.id where s.circle_id=p_circle and (p_after is null or s.id>p_after) order by s.id limit p_size+1)x;
 return jsonb_build_object('items',items,'platform_admin',private.platform_rank()>=30,'require_review',coalesce((select require_review from private.faith_builder_settings where circle_id=p_circle),false));end if;
 select * into s from public.bible_studies where id=p_study and circle_id=p_circle;
 if not found then raise exception 'Unavailable' using errcode='42501';end if;
 if p_view='detail' then return jsonb_build_object('study',to_jsonb(s),'review',coalesce((select jsonb_build_object('state',state,'reason',reason)from private.faith_builder_reviews where study_id=s.id),'null'),'platform_admin',private.platform_rank()>=30,'require_review',coalesce((select require_review from private.faith_builder_settings where circle_id=p_circle),false),'cover_version',(select version from public.faith_study_covers where study_id=s.id));
 elsif p_view='sessions' then
 select coalesce(jsonb_agg(x order by x.session_number),'[]')into items from(select t.id,t.session_number,t.title,t.release_at from public.bible_study_sessions t where t.study_id=s.id and (p_after is null or t.session_number>(select session_number from public.bible_study_sessions where id=p_after and study_id=s.id))order by t.session_number limit p_size+1)x;
 elsif p_view='session' then
 return (select to_jsonb(t)||jsonb_build_object('questions',coalesce((select jsonb_agg(q order by q.display_order)from public.study_questions q where q.session_id=t.id),'[]'))from public.bible_study_sessions t where t.study_id=s.id and t.id=p_after);
 else
 select coalesce(jsonb_agg(x order by x.id desc),'[]')into items from(select id::text id,action,revision,created_at from private.faith_builder_audit where study_id=s.id and (p_after is null) order by id desc limit 30)x;
 end if;return jsonb_build_object('items',items);
end$$;
create function public.faith_builder_command(p_circle uuid,p_operation text,p_data jsonb)returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare actor uuid:=auth.uid();s public.bible_studies;sid uuid;tid uuid;v jsonb;q jsonb;ids uuid[];pos integer;n integer;rev integer;begin
 if not private.faith_builder_editor(p_circle)then raise exception 'Unavailable' using errcode='42501';end if;
 if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>180000 or p_data ?| array['actor','user_id','created_by','role','approved','grants'] then raise exception 'Invalid input' using errcode='22023';end if;
 if not private.take_limit('faith-builder-write:'||actor::text,60,60) then return jsonb_build_object('limited',true);end if;
 perform pg_advisory_xact_lock(20261030);perform 1 from public.communities where id=p_circle for update;
 if not private.faith_builder_editor(p_circle)then raise exception 'Unavailable' using errcode='42501';end if;
 if p_operation='review-policy' then
  if private.platform_rank()<30 or jsonb_typeof(p_data->'required')<>'boolean'then raise exception 'Unavailable' using errcode='42501';end if;
  insert into private.faith_builder_settings values(p_circle,(p_data->>'required')::boolean)on conflict(circle_id)do update set require_review=excluded.require_review;
  insert into public.community_audit_log(community_id,actor_id,action,detail)values(p_circle,actor,'faith.review-policy',jsonb_build_object('required',p_data->'required'));return jsonb_build_object('id',p_circle,'revision',1);
 end if;
 sid:=(p_data->>'study')::uuid;
 if p_operation='create' then
  if (select count(*)from public.bible_studies where circle_id=p_circle and status<>'archived')>=100 and not exists(select 1 from public.bible_studies where id=sid and circle_id=p_circle)then raise exception 'Study limit' using errcode='22023';end if;
  insert into public.bible_studies(id,circle_id,title,created_by)values(sid,p_circle,'Untitled study',actor)on conflict do nothing;
  get diagnostics n=row_count;
  if n=1 then insert into private.faith_builder_audit(study_id,actor_id,action,revision)values(sid,actor,'create',1);end if;
  if not exists(select 1 from public.bible_studies where id=sid and circle_id=p_circle and created_by=actor)then raise exception 'Unavailable' using errcode='42501';end if;
  return jsonb_build_object('id',sid,'revision',(select revision from public.bible_studies where id=sid));
 end if;
 select * into s from public.bible_studies where id=sid and circle_id=p_circle for update;
 if not found then raise exception 'Unavailable' using errcode='42501';end if;
 if s.revision is distinct from (p_data->>'revision')::integer then raise exception 'Revision changed' using errcode='40001';end if;
 if p_operation='withdraw' then
  if s.status<>'draft'then raise exception 'Draft required' using errcode='22023';end if;
  delete from private.faith_builder_reviews where study_id=s.id;
 elsif p_operation='review' then
  if private.platform_rank()<30 or not exists(select 1 from private.faith_builder_reviews where study_id=s.id and state='submitted' and submitted_by is distinct from actor) or coalesce(p_data->>'decision','')not in ('approved','changes_requested')or not private.space_text(p_data->>'reason',500)then raise exception 'Independent platform review required' using errcode='42501';end if;
  update private.faith_builder_reviews set state=p_data->>'decision',reviewed_by=actor,reason=p_data->>'reason',updated_at=now()where study_id=s.id;
 elsif p_operation in ('submit','publish')then
  if s.status<>'draft' or p_data->>'rights_confirmed' is distinct from 'true' or s.title='Untitled study' or not private.space_text(s.description,4000)or (select count(*)from public.bible_study_sessions where study_id=s.id)<>s.planned_sessions or exists(select 1 from public.bible_study_sessions t where study_id=s.id and (not private.space_text(t.teaching_content,20000)or not private.space_text(t.application_challenge,4000)or not private.space_text(t.prayer_prompt,4000)or not exists(select 1 from public.study_questions where session_id=t.id)))then raise exception 'Complete study and confirm rights' using errcode='22023';end if;
  if p_operation='submit' then
   insert into private.faith_builder_reviews(study_id,state,submitted_by)values(s.id,'submitted',actor)on conflict(study_id)do update set state='submitted',submitted_by=actor,reviewed_by=null,reason='',updated_at=now();
  else update public.bible_studies set status='published',rights_confirmed=true where id=s.id;end if;
 elsif p_operation='archive'then
  if not private.space_text(p_data->>'reason',500)then raise exception 'Reason required' using errcode='22023';end if;
  update public.bible_studies set status='archived'where id=s.id;
 else
  if not private.faith_builder_editable(s.id)then raise exception 'Editable draft required'using errcode='42501';end if;
  if p_operation='details'then
   if not private.space_text(p_data->>'title',120)or length(p_data->>'description')>4000 or length(p_data->>'intended_audience')>500 or coalesce(p_data->>'cover','')not in ('nebula','aurora','ember','ocean')or (p_data->>'planned_sessions')::integer not between 1 and 366 or (p_data->>'duration_days')::integer not between 1 and 366 or (p_data->>'topic' is not null and p_data->>'topic'not in ('discovering-jesus','prayer','bible-books','christian-living','spiritual-growth','relationships','faith-questions','holy-spirit'))then raise exception 'Invalid details'using errcode='22023';end if;
   update public.bible_studies set title=p_data->>'title',description=p_data->>'description',intended_audience=p_data->>'intended_audience',cover_image=p_data->>'cover',planned_sessions=(p_data->>'planned_sessions')::integer,duration_days=(p_data->>'duration_days')::integer,discovery_topic=p_data->>'topic'where id=s.id;
  elsif p_operation='session'then
   tid:=(p_data->>'id')::uuid;
   if exists(select 1 from public.bible_study_sessions where id=tid and study_id<>s.id)then raise exception 'Unavailable'using errcode='42501';end if;
   if not private.space_text(p_data->>'title',120)or coalesce(p_data->>'scripture_reference','')!~'^[1-4]? ?[A-Za-z]+( [A-Za-z]+){0,3} [1-9][0-9]{0,2}(:[1-9][0-9]{0,2}(-[1-9][0-9]{0,2})?)?$'or length(p_data->>'teaching_content')>20000 or length(p_data->>'application_challenge')>4000 or length(p_data->>'prayer_prompt')>4000 or jsonb_typeof(p_data->'questions')is distinct from 'array'or jsonb_array_length(p_data->'questions')not between 1 and 50 or (coalesce(p_data->>'media_link','')<>''and (length(p_data->>'media_link')>2000 or p_data->>'media_link'!~'^https://[A-Za-z0-9][^[:space:]<>]*$'))then raise exception 'Invalid session'using errcode='22023';end if;
   if not exists(select 1 from public.bible_study_sessions where id=tid)then
    if (select count(*)from public.bible_study_sessions where study_id=s.id)>=366 then raise exception 'Session limit' using errcode='22023';end if;
    select coalesce(max(session_number),0)+1 into pos from public.bible_study_sessions where study_id=s.id;
    insert into public.bible_study_sessions(id,study_id,session_number,title,scripture_reference)values(tid,s.id,pos,p_data->>'title',p_data->>'scripture_reference');
   end if;
   update public.bible_study_sessions set title=p_data->>'title',scripture_reference=p_data->>'scripture_reference',teaching_content=p_data->>'teaching_content',application_challenge=p_data->>'application_challenge',prayer_prompt=p_data->>'prayer_prompt',media_link=coalesce(p_data->>'media_link',''),release_at=(p_data->>'release_at')::timestamptz where id=tid and study_id=s.id;
   select array_agg((x->>'id')::uuid)into ids from jsonb_array_elements(p_data->'questions')x;
   if cardinality(ids)<>(select count(distinct x)from unnest(ids)x)or exists(select 1 from public.study_questions where id=any(ids)and session_id<>tid)then raise exception 'Invalid questions'using errcode='22023';end if;
   -- Only explicitly edited draft questions can be removed; no published responses/progress are touched.
   delete from public.study_questions where session_id=tid and not(id=any(ids));
   set constraints public.study_questions_session_id_display_order_key deferred;
   pos:=0;for q in select * from jsonb_array_elements(p_data->'questions')loop
    if not private.space_text(q->>'question_text',2000)then raise exception 'Invalid question'using errcode='22023';end if;
    insert into public.study_questions(id,session_id,question_text,display_order)values((q->>'id')::uuid,tid,q->>'question_text',pos)on conflict(id)do update set question_text=excluded.question_text,display_order=excluded.display_order;
    pos:=pos+1;end loop;
   set constraints public.study_questions_session_id_display_order_key immediate;
  elsif p_operation='reorder'then
   select array_agg(x::uuid)into ids from jsonb_array_elements_text(p_data->'ids')x;
   select count(*)into n from public.bible_study_sessions where study_id=s.id;
   if cardinality(ids)<>n or n=0 or cardinality(ids)<>(select count(distinct x)from unnest(ids)x)or exists(select 1 from unnest(ids)x where not exists(select 1 from public.bible_study_sessions where id=x and study_id=s.id))then raise exception 'Full session order required'using errcode='22023';end if;
   -- Unique ordering uses a deferred constraint, never temporary invalid ordinal values.
   set constraints public.bible_study_sessions_study_id_session_number_key deferred;
   update public.bible_study_sessions t set session_number=a.ord from unnest(ids)with ordinality a(id,ord)where t.id=a.id and t.study_id=s.id;
   set constraints public.bible_study_sessions_study_id_session_number_key immediate;
  else raise exception 'Invalid operation'using errcode='22023';end if;
 end if;
 -- Review-only transitions do not edit study content; revisions still serialize all browser saves.
 if p_operation in ('submit','review')then
  update public.bible_studies set revision=revision+1,updated_at=now()where id=s.id returning revision into rev;
 else update public.bible_studies set revision=revision+1,updated_at=now()where id=s.id returning revision into rev;end if;
 insert into private.faith_builder_audit(study_id,actor_id,action,revision,reason)values(s.id,actor,p_operation,rev,coalesce(p_data->>'reason',''));
 insert into public.community_audit_log(community_id,actor_id,action,detail)values(p_circle,actor,'faith.builder-'||p_operation,jsonb_build_object('study',s.id,'revision',rev));
 return jsonb_build_object('id',coalesce(tid,s.id),'revision',rev);
end$$;
revoke all on function private.faith_builder_editor(uuid),private.faith_builder_editable(uuid),private.faith_builder_guard()from public,anon,authenticated;
revoke all on function public.faith_builder_read(uuid,uuid,uuid,integer,text),public.faith_builder_command(uuid,text,jsonb)from public,anon,authenticated;
grant execute on function public.faith_builder_read(uuid,uuid,uuid,integer,text),public.faith_builder_command(uuid,text,jsonb)to authenticated;

create table private.faith_cover_cleanup(object_path text primary key,created_at timestamptz not null default now());
alter table private.faith_cover_cleanup enable row level security;
revoke all on private.faith_cover_cleanup from public,anon,authenticated;
create function private.faith_cover_retire()returns trigger language plpgsql security definer set search_path=''as $$begin
 if tg_op='DELETE' or old.object_path is distinct from new.object_path then insert into private.faith_cover_cleanup values(old.object_path,now())on conflict do nothing;end if;
 return coalesce(new,old);end$$;
create trigger faith_cover_retire after update or delete on public.faith_study_covers for each row execute function private.faith_cover_retire();
create function public.faith_cover_command(p_study uuid,p_operation text,p_path text default null,p_version uuid default null,p_bytes integer default null)returns jsonb language plpgsql security definer set search_path=''as $$
declare s public.bible_studies;begin
 select * into s from public.bible_studies where id=p_study;
 if not found or not private.faith_builder_editable(s.id)then raise exception 'Unavailable'using errcode='42501';end if;
 if not private.take_limit('faith-cover:'||auth.uid()::text,15,60)then raise exception 'Rate limited'using errcode='42501';end if;
 perform pg_advisory_xact_lock(20261030);perform 1 from public.communities where id=s.circle_id for update;
 if not private.faith_builder_editable(s.id)then raise exception 'Unavailable'using errcode='42501';end if;
 if p_operation='save'then
  if p_path is distinct from auth.uid()::text||'/'||s.id::text||'/'||p_version::text||'.webp'or p_version is null or p_bytes not between 1 and 5242880 or not exists(select 1 from storage.objects where bucket_id='faith-study-covers'and name=p_path)then raise exception 'Invalid cover'using errcode='22023';end if;
  insert into public.faith_study_covers values(s.id,p_path,p_version,p_bytes)on conflict(study_id)do update set object_path=excluded.object_path,version=excluded.version,bytes=excluded.bytes;
  delete from private.faith_cover_cleanup where object_path=p_path;
 elsif p_operation='remove'then delete from public.faith_study_covers where study_id=s.id;
 elsif p_operation<>'check'then raise exception 'Invalid operation'using errcode='22023';end if;
 if p_operation<>'check'then insert into private.faith_builder_audit(study_id,actor_id,action,revision)values(s.id,auth.uid(),'cover-'||p_operation,s.revision);end if;
 return jsonb_build_object('ok',true);
end$$;
-- Raw paths are read only by server-side media code after a separate authenticated access check.
create function public.faith_cover_read(p_study uuid)returns boolean language sql stable security definer set search_path=''as $$select exists(select 1 from public.faith_study_covers c join public.bible_studies s on s.id=c.study_id where c.study_id=p_study and (private.faith_builder_editor(s.circle_id)or (s.status='published' and private.faith_discovery_card(s.id)is not null)));$$;
revoke all on function public.faith_cover_read(uuid),public.faith_cover_command(uuid,text,text,uuid,integer),private.faith_cover_retire()from public,anon,authenticated;
grant execute on function public.faith_cover_read(uuid),public.faith_cover_command(uuid,text,text,uuid,integer)to authenticated;
create function public.faith_cover_cleanup(p_removed text[] default null)returns text[]language plpgsql security definer set search_path=''as $$begin
 if auth.role()is distinct from 'service_role'then raise exception 'Unavailable'using errcode='42501';end if;
 if p_removed is not null then delete from private.faith_cover_cleanup where object_path=any(p_removed);end if;
 return array(select object_path from private.faith_cover_cleanup q where created_at<now()-interval '24 hours' and not exists(select 1 from public.faith_study_covers c where c.object_path=q.object_path) order by created_at limit 100);
end$$;
revoke all on function public.faith_cover_cleanup(text[])from public,anon,authenticated;grant execute on function public.faith_cover_cleanup(text[])to service_role;

create or replace function private.faith_discovery_card(sid uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s public.bible_studies;c public.communities;joined boolean;total integer;released integer;done integer;next_id uuid;started boolean;begin
 select * into s from public.bible_studies where id=sid and status='published' and rights_confirmed;
 if not found or not private.faith_circle_allowed(s.circle_id) or not private.squad_live(s.created_by) or private.squad_blocked(auth.uid(),s.created_by) then return null;end if;
 joined:=private.community_rank(s.circle_id)>0;
 if not joined and not s.discovery_enabled then return null;end if;
 select * into c from public.communities where id=s.circle_id;
 select count(*) into total from public.bible_study_sessions where study_id=s.id;
 if joined then
  select count(*) into released from public.bible_study_sessions where study_id=s.id and (release_at is null or release_at<=now());
  select count(*) into done from public.study_progress p join public.bible_study_sessions t on t.id=p.session_id where t.study_id=s.id and p.user_id=auth.uid() and (t.release_at is null or t.release_at<=now());
  select t.id into next_id from public.bible_study_sessions t where t.study_id=s.id and (t.release_at is null or t.release_at<=now()) and not exists(select 1 from public.study_progress p where p.session_id=t.id and p.user_id=auth.uid()) order by session_number limit 1;
  started:=exists(select 1 from public.study_bookmarks b where b.user_id=auth.uid() and b.study_id=s.id and public.faith_room_access(s.circle_id,s.id,b.session_id)) or exists(select 1 from public.study_progress p join public.bible_study_sessions t on t.id=p.session_id where t.study_id=s.id and p.user_id=auth.uid()) or exists(select 1 from public.study_responses r join public.bible_study_sessions t on t.id=r.session_id where t.study_id=s.id and r.author_id=auth.uid() and r.removed_at is null);
 end if;
 return jsonb_build_object('id',s.id,'circle_id',c.id,'circle_name',c.name,'privacy',c.visibility,'joined',joined,'title',s.title,'description',s.description,'cover',s.cover_image,'cover_version',(select version from public.faith_study_covers where study_id=s.id),'can_feature',private.platform_rank()>=30,'duration_days',s.duration_days,'topic',s.discovery_topic,'featured',s.discovery_featured,'can_curate',joined and private.faith_builder_editor(s.circle_id),'discoverable',s.discovery_enabled,'sessions',total,'released',released,'completed',done,'next_session',next_id,'resume_session',case when joined then (select b.session_id from public.study_bookmarks b where b.user_id=auth.uid() and b.study_id=s.id and public.faith_room_access(s.circle_id,s.id,b.session_id) and not exists(select 1 from public.study_progress p where p.user_id=auth.uid() and p.session_id=b.session_id)) else null end,'started',started,'updated_at',s.updated_at);
end$$;

create function public.faith_builder_circles(p_after uuid default null)returns jsonb language plpgsql security definer set search_path=''as $$begin
 if not private.squad_live(auth.uid())then raise exception 'Unavailable'using errcode='42501';end if;
 if not private.take_limit('faith-builder-read:'||auth.uid()::text,180,60)then return jsonb_build_object('limited',true);end if;
 return jsonb_build_object('items',coalesce((select jsonb_agg(x order by x.id)from(select c.id,c.name from public.communities c join public.faith_circles f on f.community_id=c.id where private.faith_builder_editor(c.id)and(p_after is null or c.id>p_after)order by c.id limit 21)x),'[]'));
end$$;
revoke all on function public.faith_builder_circles(uuid)from public,anon,authenticated;grant execute on function public.faith_builder_circles(uuid)to authenticated;

create or replace function public.faith_study_discovery_set(p_study uuid,p_enabled boolean,p_featured boolean,p_topic text default null) returns boolean language plpgsql security definer set search_path='' as $$
declare cid uuid;begin
 if not private.squad_live(auth.uid()) then raise exception 'Unavailable' using errcode='42501';end if;
 select circle_id into cid from public.bible_studies where id=p_study;
 if not private.faith_builder_editor(cid) then raise exception 'Unavailable' using errcode='42501';end if;
 if not private.take_limit('faith-write:'||auth.uid()::text,60,60) then return false;end if;
 perform pg_advisory_xact_lock(20261030);
 perform 1 from public.communities where id=cid for update;
 if not private.faith_builder_editor(cid) then raise exception 'Unavailable' using errcode='42501';end if;
 if p_enabled is null or p_featured is null or (p_topic is not null and p_topic not in ('discovering-jesus','prayer','bible-books','christian-living','spiritual-growth','relationships','faith-questions','holy-spirit')) then raise exception 'Invalid discovery settings' using errcode='22023';end if;
 update public.bible_studies set discovery_enabled=p_enabled,discovery_featured=p_featured,discovery_topic=p_topic where id=p_study and status='published';
 if not found then raise exception 'Unavailable' using errcode='42501';end if;
 insert into public.community_audit_log(community_id,actor_id,action,detail)values(cid,auth.uid(),'faith.discovery',jsonb_build_object('study',p_study,'enabled',p_enabled,'featured',p_featured,'topic',p_topic));return true;
end$$;
-- Service-only cleanup queue also tracks uploads interrupted before their database assignment.
create function public.faith_cover_stage(p_path text)returns boolean language plpgsql security definer set search_path=''as $$begin
 if auth.role()is distinct from 'service_role' or p_path!~'^[a-f0-9-]{36}/[a-f0-9-]{36}/[a-f0-9-]{36}\.webp$'then raise exception 'Unavailable'using errcode='42501';end if;
 insert into private.faith_cover_cleanup values(p_path,now())on conflict do nothing;return true;
end$$;
revoke all on function public.faith_cover_stage(text)from public,anon,authenticated;grant execute on function public.faith_cover_stage(text)to service_role;
grant all on public.faith_study_covers to service_role;
