-- Owner-only resume and personal reflections, without a second discussion or media system.
create unique index bible_sessions_id_study on public.bible_study_sessions(id,study_id);
create table public.study_bookmarks(
 user_id uuid not null references auth.users(id) on delete cascade,
 study_id uuid not null references public.bible_studies(id) on delete cascade,
 session_id uuid not null references public.bible_study_sessions(id) on delete cascade,
 visited_at timestamptz not null default clock_timestamp(),primary key(user_id,study_id),
 foreign key(session_id,study_id) references public.bible_study_sessions(id,study_id) on delete cascade
);
create index study_bookmarks_study on public.study_bookmarks(study_id);
create index study_bookmarks_session on public.study_bookmarks(session_id);
create table public.study_reflections(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 session_id uuid not null references public.bible_study_sessions(id) on delete cascade,
 kind text not null check(kind in ('application','prayer')),body text not null default '' check(length(body)<=8000),
 revision integer not null default 1 check(revision>0),updated_at timestamptz not null default now(),unique(user_id,session_id,kind)
);
create index study_reflections_session on public.study_reflections(session_id);
create function public.faith_room_access(p_circle uuid,p_study uuid,p_session uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.faith_member_access(p_circle) and exists(select 1 from public.bible_studies s join public.bible_study_sessions t on t.study_id=s.id where s.id=p_study and s.circle_id=p_circle and s.status='published' and s.rights_confirmed and t.id=p_session and (t.release_at is null or t.release_at<=now()) and public.faith_session_access(t.id));
$$;
alter table public.study_bookmarks enable row level security;
alter table public.study_reflections enable row level security;
revoke all on public.study_bookmarks,public.study_reflections from public,anon,authenticated;
grant select on public.study_bookmarks,public.study_reflections to authenticated;
create policy study_bookmark_own on public.study_bookmarks for select to authenticated using(user_id=auth.uid() and exists(select 1 from public.bible_studies s where s.id=study_id and public.faith_room_access(s.circle_id,s.id,session_id)));
create policy study_reflection_own on public.study_reflections for select to authenticated using(user_id=auth.uid() and exists(select 1 from public.bible_study_sessions t join public.bible_studies s on s.id=t.study_id where t.id=session_id and public.faith_room_access(s.circle_id,s.id,t.id)));
create function public.faith_room_command(p_operation text,p_circle uuid,p_study uuid,p_session uuid,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare v jsonb;n public.study_reflections;begin
 if not private.squad_live(auth.uid()) then raise exception 'Unavailable' using errcode='42501';end if;
 if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>40000 or p_data ?| array['actor','user_id','author_id','role','created_by'] then raise exception 'Invalid input' using errcode='22023';end if;
 perform pg_advisory_xact_lock(20261030);perform 1 from public.communities where id=p_circle for update;
 if not public.faith_room_access(p_circle,p_study,p_session) then raise exception 'Unavailable' using errcode='42501';end if;
 if p_operation in ('visit','reflection') then
  if not private.take_limit('faith-room-write:'||auth.uid()::text,90,60) then return jsonb_build_object('limited',true);end if;
  if p_operation='visit' then
   insert into public.study_bookmarks(user_id,study_id,session_id)values(auth.uid(),p_study,p_session)on conflict(user_id,study_id)do update set session_id=excluded.session_id,visited_at=clock_timestamp();
   return jsonb_build_object('ok',true,'id',p_session);
  end if;
  if coalesce(p_data->>'kind','') not in ('application','prayer') or p_data->>'body' is null or length(p_data->>'body')>8000 or (p_data->>'body'<>'' and not private.space_text(p_data->>'body',8000)) then raise exception 'Invalid reflection' using errcode='22023';end if;
  select * into n from public.study_reflections where user_id=auth.uid() and session_id=p_session and kind=p_data->>'kind' for update;
  if found then
   if n.body=p_data->>'body' then return to_jsonb(n)-'user_id';end if;
   if n.revision is distinct from (p_data->>'revision')::integer then raise exception 'Reflection changed' using errcode='40001';end if;
   update public.study_reflections set body=p_data->>'body',revision=revision+1,updated_at=now() where id=n.id returning * into n;
  else
   if coalesce((p_data->>'revision')::integer,0)<>0 then raise exception 'Reflection changed' using errcode='40001';end if;
   insert into public.study_reflections(user_id,session_id,kind,body)values(auth.uid(),p_session,p_data->>'kind',p_data->>'body')returning * into n;
  end if;return to_jsonb(n)-'user_id';
 elsif p_operation='answer' then
  v:=public.faith_backend_command('response-save',p_circle,(p_data-'session')||jsonb_build_object('session',p_session));
  if v->>'limited'='true' then return v;end if;
  return(select to_jsonb(r) from public.study_responses r where r.id=(v->>'id')::uuid and r.author_id=auth.uid());
 elsif p_operation='complete' then
  if coalesce(p_data->>'completed','') not in ('true','false') then raise exception 'Invalid progress' using errcode='22023';end if;
  v:=public.faith_backend_command('progress-save',p_circle,jsonb_build_object('session',p_session,'completed',p_data->'completed'));
  if v->>'limited'='true' then return v;end if;
  return jsonb_build_object('completed',exists(select 1 from public.study_progress where user_id=auth.uid() and session_id=p_session));
 else raise exception 'Invalid operation' using errcode='22023';end if;
end$$;
create function public.faith_room_read(p_view text,p_circle uuid,p_study uuid,p_session uuid,p_after uuid default null,p_size integer default 20) returns jsonb language plpgsql security definer set search_path='' as $$
declare items jsonb;pos integer;begin
 if not public.faith_room_access(p_circle,p_study,p_session) then raise exception 'Unavailable' using errcode='42501';end if;
 if p_size is null or p_size not between 1 and 40 then raise exception 'Invalid page' using errcode='22023';end if;
 if not private.take_limit('faith-room-read:'||auth.uid()::text,240,60) then return jsonb_build_object('limited',true);end if;
 if p_view='context' then
  return jsonb_build_object('session',(select to_jsonb(t) from public.bible_study_sessions t where t.id=p_session),
   'circle',private.faith_circle_card(p_circle),'study',(select jsonb_build_object('id',id,'title',title) from public.bible_studies where id=p_study),
   'completed',exists(select 1 from public.study_progress where user_id=auth.uid() and session_id=p_session),
   'total',(select count(*) from public.bible_study_sessions where study_id=p_study),
   'done',(select count(*) from public.study_progress x join public.bible_study_sessions t on t.id=x.session_id where x.user_id=auth.uid() and t.study_id=p_study and (t.release_at is null or t.release_at<=now())),
   'previous',(select id from public.bible_study_sessions where study_id=p_study and session_number<(select session_number from public.bible_study_sessions where id=p_session) and (release_at is null or release_at<=now()) order by session_number desc limit 1),
   'next',(select id from public.bible_study_sessions where study_id=p_study and session_number>(select session_number from public.bible_study_sessions where id=p_session) and (release_at is null or release_at<=now()) order by session_number limit 1),
   'notes',coalesce((select jsonb_agg(to_jsonb(n)-'user_id') from public.study_reflections n where n.user_id=auth.uid() and n.session_id=p_session),'[]'),
   'hangout',(select jsonb_build_object('id',e.id,'title',e.title,'starts_at',e.starts_at,'ends_at',e.ends_at,'time_zone',e.time_zone) from public.events e join public.faith_circles f on f.community_id=e.community_id where e.community_id=p_circle and e.voice_channel_id=f.hangout_channel_id and e.status='scheduled' and e.ends_at>now() and public.event_access(e.id) and public.channel_access(e.voice_channel_id,'connect') order by e.starts_at,e.id limit 1));
 elsif p_view in ('sessions','questions') then
  if p_after is not null then
   if p_view='sessions' then select session_number into pos from public.bible_study_sessions where id=p_after and study_id=p_study and public.faith_room_access(p_circle,p_study,id);
   else select display_order into pos from public.study_questions where id=p_after and session_id=p_session;end if;
   if not found then raise exception 'Invalid cursor' using errcode='22023';end if;
  end if;
  if p_view='sessions' then
   select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'title',q.title,'number',q.session_number,'completed',exists(select 1 from public.study_progress p where p.user_id=auth.uid() and p.session_id=q.id))order by q.session_number),'[]') into items from(select * from public.bible_study_sessions where study_id=p_study and public.faith_room_access(p_circle,p_study,id) and (p_after is null or session_number>pos) order by session_number limit p_size+1)q;
  else
   select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'question_text',q.question_text,'display_order',q.display_order,'own',(select to_jsonb(r) from public.study_responses r where r.question_id=q.id and r.author_id=auth.uid()))order by q.display_order),'[]') into items from(select * from public.study_questions where session_id=p_session and (p_after is null or display_order>pos) order by display_order limit p_size+1)q;
  end if;
 elsif p_view='question' then
  select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'question_text',q.question_text,'display_order',q.display_order,'own',(select to_jsonb(r) from public.study_responses r where r.question_id=q.id and r.author_id=auth.uid()))),'[]') into items from public.study_questions q where q.id=p_after and q.session_id=p_session;
 elsif p_view='shared' then
  select coalesce(jsonb_agg(jsonb_build_object('response',to_jsonb(q),'member',jsonb_build_object('id',p.id,'name',p.display_name))order by q.id),'[]') into items from(select * from public.study_responses r where r.session_id=p_session and r.audience='circle' and r.removed_at is null and r.hidden_at is null and public.faith_response_access(r.id) and (p_after is null or r.id>p_after) order by r.id limit p_size+1)q join public.profiles p on p.id=q.author_id;
 else raise exception 'Invalid view' using errcode='22023';end if;
 return jsonb_build_object('items',items);
end$$;
-- Resume is a separate owner-only projection. It never changes completion or sends visit data to members.
create function public.faith_study_resume(p_study uuid) returns uuid language sql stable security definer set search_path='' as $$
 select b.session_id from public.study_bookmarks b join public.bible_studies s on s.id=b.study_id where b.user_id=auth.uid() and b.study_id=p_study and public.faith_room_access(s.circle_id,s.id,b.session_id);
$$;
revoke all on function public.faith_room_access(uuid,uuid,uuid),public.faith_room_command(text,uuid,uuid,uuid,jsonb),public.faith_room_read(text,uuid,uuid,uuid,uuid,integer),public.faith_study_resume(uuid) from public,anon,authenticated;
grant execute on function public.faith_room_access(uuid,uuid,uuid),public.faith_room_command(text,uuid,uuid,uuid,jsonb),public.faith_room_read(text,uuid,uuid,uuid,uuid,integer),public.faith_study_resume(uuid) to authenticated;
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
 return jsonb_build_object('id',s.id,'circle_id',c.id,'circle_name',c.name,'privacy',c.visibility,'joined',joined,'title',s.title,'description',s.description,'cover',s.cover_image,'duration_days',s.duration_days,'topic',s.discovery_topic,'featured',s.discovery_featured,'can_curate',joined and private.faith_editor(s.circle_id),'discoverable',s.discovery_enabled,'sessions',total,'released',released,'completed',done,'next_session',next_id,'resume_session',case when joined then (select b.session_id from public.study_bookmarks b where b.user_id=auth.uid() and b.study_id=s.id and public.faith_room_access(s.circle_id,s.id,b.session_id) and not exists(select 1 from public.study_progress p where p.user_id=auth.uid() and p.session_id=b.session_id)) else null end,'started',started,'updated_at',s.updated_at);
end$$;
create or replace function public.faith_study_directory(p_mode text default 'explore',p_topic text default null,p_circle uuid default null,p_after uuid default null,p_size integer default 12) returns jsonb language plpgsql security definer set search_path='' as $$
declare items jsonb;begin
 if not private.squad_live(auth.uid()) then raise exception 'Unavailable' using errcode='42501';end if;
 if p_mode is null or p_mode not in ('explore','featured','continue','mine') or p_size is null or p_size not between 1 and 24 or (p_topic is not null and p_topic not in ('discovering-jesus','prayer','bible-books','christian-living','spiritual-growth','relationships','faith-questions','holy-spirit')) then raise exception 'Invalid query' using errcode='22023';end if;
 if not private.take_limit('faith-discovery:'||auth.uid()::text,180,60) then return jsonb_build_object('limited',true);end if;
 if p_mode='mine' then
  select coalesce(jsonb_agg(jsonb_build_object('id',q.community_id,'circle',private.faith_circle_card(q.community_id),'current_study',private.faith_discovery_card((select s.id from public.bible_studies s where s.circle_id=q.community_id and public.faith_study_access(s.id) and s.status='published' and private.squad_live(s.created_by) and not private.squad_blocked(auth.uid(),s.created_by) order by s.created_at desc,s.id desc limit 1))) order by q.community_id),'[]') into items from(select f.community_id from public.faith_circles f where private.faith_circle_allowed(f.community_id) and private.community_rank(f.community_id)>0 and (p_after is null or f.community_id>p_after) order by f.community_id limit p_size+1)q;
 else
  select coalesce(jsonb_agg(q.card order by q.id),'[]') into items from(
   select s.id,private.faith_discovery_card(s.id) card from public.bible_studies s where s.status='published' and s.rights_confirmed and (p_topic is null or s.discovery_topic=p_topic) and (p_circle is null or s.circle_id=p_circle) and (p_after is null or s.id>p_after)
   and (p_mode<>'featured' or s.discovery_featured) and private.faith_circle_allowed(s.circle_id) and private.squad_live(s.created_by) and not private.squad_blocked(auth.uid(),s.created_by)
   and (private.community_rank(s.circle_id)>0 or s.discovery_enabled)
   and (p_mode<>'continue' or (private.community_rank(s.circle_id)>0 and (exists(select 1 from public.study_bookmarks b where b.user_id=auth.uid() and b.study_id=s.id and public.faith_room_access(s.circle_id,s.id,b.session_id)) or exists(select 1 from public.study_progress p join public.bible_study_sessions t on t.id=p.session_id where t.study_id=s.id and p.user_id=auth.uid()) or exists(select 1 from public.study_responses r join public.bible_study_sessions t on t.id=r.session_id where t.study_id=s.id and r.author_id=auth.uid() and r.removed_at is null))))
   and (p_mode<>'continue' or exists(select 1 from public.bible_study_sessions t where t.study_id=s.id and ((t.release_at is not null and t.release_at>now()) or not exists(select 1 from public.study_progress p where p.session_id=t.id and p.user_id=auth.uid()))))
   order by s.id limit p_size+1)q;
 end if;return jsonb_build_object('items',items);
end$$;
notify pgrst,'reload schema';
