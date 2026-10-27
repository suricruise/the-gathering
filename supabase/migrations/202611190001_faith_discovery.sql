-- Explicit editorial discovery metadata; no backfill or automatic public exposure.
alter table public.bible_studies add column discovery_enabled boolean not null default false,
 add column discovery_featured boolean not null default false,
 add column discovery_topic text check(discovery_topic in ('discovering-jesus','prayer','bible-books','christian-living','spiritual-growth','relationships','faith-questions','holy-spirit'));
create index faith_studies_discovery on public.bible_studies(discovery_topic,id) where status='published' and discovery_enabled;
create function public.faith_study_discovery_set(p_study uuid,p_enabled boolean,p_featured boolean,p_topic text default null) returns boolean language plpgsql security definer set search_path='' as $$
declare cid uuid;begin
 if not private.squad_live(auth.uid()) then raise exception 'Unavailable' using errcode='42501';end if;
 select circle_id into cid from public.bible_studies where id=p_study;
 if not private.faith_editor(cid) then raise exception 'Unavailable' using errcode='42501';end if;
 if not private.take_limit('faith-write:'||auth.uid()::text,60,60) then return false;end if;
 perform pg_advisory_xact_lock(20261030);
 perform 1 from public.communities where id=cid for update;
 if not private.faith_editor(cid) then raise exception 'Unavailable' using errcode='42501';end if;
 if p_enabled is null or p_featured is null or (p_topic is not null and p_topic not in ('discovering-jesus','prayer','bible-books','christian-living','spiritual-growth','relationships','faith-questions','holy-spirit')) then raise exception 'Invalid discovery settings' using errcode='22023';end if;
 update public.bible_studies set discovery_enabled=p_enabled,discovery_featured=p_featured,discovery_topic=p_topic where id=p_study and status='published';
 if not found then raise exception 'Unavailable' using errcode='42501';end if;
 insert into public.community_audit_log(community_id,actor_id,action,detail)values(cid,auth.uid(),'faith.discovery',jsonb_build_object('study',p_study,'enabled',p_enabled,'featured',p_featured,'topic',p_topic));return true;
end$$;
create function private.faith_discovery_card(sid uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
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
  started:=exists(select 1 from public.study_progress p join public.bible_study_sessions t on t.id=p.session_id where t.study_id=s.id and p.user_id=auth.uid()) or exists(select 1 from public.study_responses r join public.bible_study_sessions t on t.id=r.session_id where t.study_id=s.id and r.author_id=auth.uid() and r.removed_at is null);
 end if;
 return jsonb_build_object('id',s.id,'circle_id',c.id,'circle_name',c.name,'privacy',c.visibility,'joined',joined,'title',s.title,'description',s.description,'cover',s.cover_image,'duration_days',s.duration_days,'topic',s.discovery_topic,'featured',s.discovery_featured,'can_curate',joined and private.faith_editor(s.circle_id),'discoverable',s.discovery_enabled,'sessions',total,'released',released,'completed',done,'next_session',next_id,'started',started,'updated_at',s.updated_at);
end$$;
create function public.faith_study_directory(p_mode text default 'explore',p_topic text default null,p_circle uuid default null,p_after uuid default null,p_size integer default 12) returns jsonb language plpgsql security definer set search_path='' as $$
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
   and (p_mode<>'continue' or (private.community_rank(s.circle_id)>0 and (exists(select 1 from public.study_progress p join public.bible_study_sessions t on t.id=p.session_id where t.study_id=s.id and p.user_id=auth.uid()) or exists(select 1 from public.study_responses r join public.bible_study_sessions t on t.id=r.session_id where t.study_id=s.id and r.author_id=auth.uid() and r.removed_at is null))))
   and (p_mode<>'continue' or exists(select 1 from public.bible_study_sessions t where t.study_id=s.id and ((t.release_at is not null and t.release_at>now()) or not exists(select 1 from public.study_progress p where p.session_id=t.id and p.user_id=auth.uid()))))
   order by s.id limit p_size+1)q;
 end if;return jsonb_build_object('items',items);
end$$;
create function public.faith_study_summary(p_study uuid) returns jsonb language plpgsql security definer set search_path='' as $$begin
 if not private.squad_live(auth.uid()) then raise exception 'Unavailable' using errcode='42501';end if;
 if not private.take_limit('faith-discovery:'||auth.uid()::text,180,60) then return jsonb_build_object('limited',true);end if;
 return private.faith_discovery_card(p_study);
end$$;
revoke all on function private.faith_discovery_card(uuid),public.faith_study_discovery_set(uuid,boolean,boolean,text),public.faith_study_directory(text,text,uuid,uuid,integer),public.faith_study_summary(uuid) from public,anon,authenticated;
grant execute on function public.faith_study_discovery_set(uuid,boolean,boolean,text),public.faith_study_directory(text,text,uuid,uuid,integer),public.faith_study_summary(uuid) to authenticated;
notify pgrst,'reload schema';
