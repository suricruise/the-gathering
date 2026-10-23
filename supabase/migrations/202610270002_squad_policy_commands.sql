-- Policy evaluation must not require a hidden host_id column privilege.
create function private.squad_member_read(p_session uuid,p_user uuid,p_status text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.gaming_sessions s where s.id=p_session and private.squad_eligible(auth.uid(),s) and (p_user=auth.uid() or s.host_id=auth.uid() or (p_status='accepted' and private.squad_roster(s.id))));
$$;
revoke all on function private.squad_member_read(uuid,uuid,text) from public,anon,authenticated;
grant execute on function private.squad_member_read(uuid,uuid,text) to authenticated;
drop policy gaming_members_read on public.gaming_session_members;
create policy gaming_members_read on public.gaming_session_members for select to authenticated using(private.squad_member_read(session_id,user_id,status));
drop policy member_blocks_read on public.member_blocks;
create policy member_blocks_read on public.member_blocks for select to authenticated using(blocker_id=auth.uid() and private.is_verified_member());
revoke all on function private.squad_live(uuid) from authenticated;

create or replace function private.squad_on_block() returns trigger language plpgsql security definer set search_path='' as $$
declare s public.gaming_sessions;
begin
 for s in select g.* from public.gaming_sessions g where exists(select 1 from public.gaming_session_members a join public.gaming_session_members b on a.session_id=b.session_id where a.session_id=g.id and a.user_id=new.blocker_id and b.user_id=new.blocked_id and a.status in ('accepted','pending') and b.status in ('accepted','pending')) order by g.id for update of g loop
  update public.gaming_session_members set status=case when s.host_id=new.blocker_id then 'removed' else 'withdrawn' end,updated_at=clock_timestamp() where session_id=s.id and user_id=case when s.host_id=new.blocker_id then new.blocked_id else new.blocker_id end;
  delete from private.squad_voice_sessions where session_id=s.id and user_id=case when s.host_id=new.blocker_id then new.blocked_id else new.blocker_id end;
  insert into private.squad_audit(session_id,actor_id,target_id,action) values(s.id,new.blocker_id,new.blocked_id,'block_separation');
 end loop;return new;
end $$;

create or replace function public.squad_command(p_operation text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); s public.gaming_sessions; m public.gaming_session_members; cfg private.squad_config; item uuid; target uuid; txt text; label_value text; begins timestamptz; desired text; n integer; budget text;
begin
 if not private.squad_live(actor) then raise exception 'Not authorized' using errcode='42501';end if;
 budget:=case when p_operation='create' then 'create' when p_operation='join' then 'join' when p_operation='withdraw' then 'withdraw' when p_operation in ('block-host','block-member','unblock') then 'block' else 'host' end;
 if not private.squad_take(budget) then return jsonb_build_object('limited',true);end if;
 if p_operation='unblock' then delete from public.member_blocks where blocker_id=actor and blocked_id=(p_data->>'target')::uuid;return jsonb_build_object('ok',true);end if;
 if p_operation in ('block-host','block-member') then
  select * into s from public.gaming_sessions where id=(p_data->>'session')::uuid;
  if not found or not private.squad_eligible(actor,s) then raise exception 'Session unavailable' using errcode='42501';end if;
  if p_operation='block-host' then target:=s.host_id;label_value:=(private.squad_dto(s)->>'host_name');
  else
   target:=(p_data->>'target')::uuid;
   if s.host_id<>actor or not exists(select 1 from public.gaming_session_members where session_id=s.id and user_id=target) then raise exception 'Not authorized' using errcode='42501';end if;
   select display_name into label_value from public.profiles where id=target;
  end if;
  if target=actor then raise exception 'Invalid member' using errcode='22023';end if;
  if (select count(*) from public.member_blocks where blocker_id=actor)>=100 then raise exception 'Block list is full' using errcode='54000';end if;
  insert into public.member_blocks(blocker_id,blocked_id,label) values(actor,target,left(coalesce(nullif(label_value,''),'Member'),80)) on conflict do nothing;
  return jsonb_build_object('ok',true);
 end if;
 select * into cfg from private.squad_config where id;
 if p_operation='create' then
  item:=(p_data->>'id')::uuid;
  perform pg_advisory_xact_lock(hashtextextended(actor::text,718));
  select * into s from public.gaming_sessions where id=item;
  if found then if s.host_id<>actor then raise exception 'Not authorized' using errcode='42501';end if;return jsonb_build_object('id',s.id);end if;
  if exists(select 1 from public.channels where id=item) then raise exception 'Invalid session ID' using errcode='22023';end if;
  if (select count(*) from public.gaming_sessions where host_id=actor and status='open' and expires_at>clock_timestamp())>=cfg.max_active_per_host then raise exception 'Too many active sessions' using errcode='54000';end if;
  begins:=nullif(p_data->>'starts_at','')::timestamptz;
  if begins is not null and (begins<clock_timestamp()-interval '1 minute' or begins>clock_timestamp()+make_interval(days=>cfg.max_schedule_days)) then raise exception 'Invalid start time' using errcode='22023';end if;
  if coalesce(p_data->>'title','') ~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]' or btrim(coalesce(p_data->>'title',''))='' or coalesce(p_data->>'description','') ~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]' or btrim(coalesce(p_data->>'description',''))='' then raise exception 'Invalid description' using errcode='22023';end if;
  insert into public.gaming_sessions(id,host_id,title,description,game_id,platform_id,cross_play,play_style,max_players,requires_approval,visibility,community_id,game_night,starts_at,expires_at)
  values(item,actor,p_data->>'title',p_data->>'description',p_data->>'game',p_data->>'platform',(p_data->>'cross_play')::boolean,p_data->>'style',(p_data->>'max_players')::integer,(p_data->>'approval')::boolean,p_data->>'visibility',nullif(p_data->>'community','')::uuid,(p_data->>'game_night')::boolean,begins,greatest(coalesce(begins,clock_timestamp()),clock_timestamp())+make_interval(mins=>cfg.duration_minutes)) returning * into s;
  if not private.squad_eligible(actor,s) then raise exception 'Not authorized' using errcode='42501';end if;
  if s.cross_play and not exists(select 1 from public.game_platforms base join public.game_platforms other on other.game_id=base.game_id and other.platform_id<>base.platform_id and other.crossplay_pool=base.crossplay_pool where base.game_id=s.game_id and base.platform_id=s.platform_id) then raise exception 'Cross-play not supported for this platform' using errcode='22023';end if;
  insert into public.gaming_session_members values(s.id,actor,s.platform_id,'accepted',clock_timestamp(),clock_timestamp());
  insert into private.squad_audit(session_id,actor_id,action) values(s.id,actor,'create');return jsonb_build_object('id',s.id);
 end if;
 item:=(p_data->>'session')::uuid;
 select * into s from public.gaming_sessions where id=item for update;
 if not found then raise exception 'Session unavailable' using errcode='42501';end if;
 if p_operation='withdraw' then
  if s.host_id=actor then raise exception 'Hosts must cancel their session' using errcode='22023';end if;
  if not exists(select 1 from public.gaming_session_members where session_id=s.id and user_id=actor) then raise exception 'Session unavailable' using errcode='42501';end if;
  update public.gaming_session_members set status='withdrawn',updated_at=clock_timestamp() where session_id=s.id and user_id=actor and status in ('accepted','pending');
  delete from private.squad_voice_sessions where session_id=s.id and user_id=actor;
  insert into private.squad_audit(session_id,actor_id,action) values(s.id,actor,'withdraw');return jsonb_build_object('id',s.id);
 end if;
 if not private.squad_eligible(actor,s) then raise exception 'Session unavailable' using errcode='42501';end if;
 if p_operation='cancel' then
  if s.host_id<>actor then raise exception 'Not authorized' using errcode='42501';end if;
  if s.status='open' then update public.gaming_sessions set status='cancelled',ended_at=clock_timestamp(),voice_epoch=gen_random_uuid() where id=s.id;delete from private.squad_voice_sessions where session_id=s.id;insert into private.squad_audit(session_id,actor_id,action) values(s.id,actor,'cancel');end if;
  return jsonb_build_object('id',s.id);
 end if;
 if s.status<>'open' or s.expires_at<=clock_timestamp() then raise exception 'Session has ended' using errcode='55000';end if;
 if p_operation='join' then
  if not private.squad_compatible(s,p_data->>'platform') then raise exception 'Choose a compatible platform' using errcode='22023';end if;
  if exists(select 1 from public.gaming_session_members other where other.session_id=s.id and other.status='accepted' and private.squad_eligible(other.user_id,s) and private.squad_blocked(actor,other.user_id)) then raise exception 'Session unavailable' using errcode='42501';end if;
  select * into m from public.gaming_session_members where session_id=s.id and user_id=actor;
  if found and m.status in ('accepted','pending') then return jsonb_build_object('id',s.id,'status',m.status);end if;
  if found and m.status in ('removed','rejected') then raise exception 'Session unavailable' using errcode='42501';end if;
  if (select count(*) from public.gaming_session_members where session_id=s.id and status='accepted')>=s.max_players then raise exception 'Session is full' using errcode='54000';end if;
  if s.requires_approval and (select count(*) from public.gaming_session_members where session_id=s.id and status='pending')>=50 then raise exception 'Approval queue is full' using errcode='54000';end if;
  desired:=case when s.requires_approval then 'pending' else 'accepted' end;
  insert into public.gaming_session_members values(s.id,actor,p_data->>'platform',desired,clock_timestamp(),clock_timestamp()) on conflict(session_id,user_id) do update set status=excluded.status,platform_id=excluded.platform_id,updated_at=excluded.updated_at;
  insert into private.squad_audit(session_id,actor_id,action) values(s.id,actor,desired);return jsonb_build_object('id',s.id,'status',desired);
 end if;
 if p_operation not in ('approve','reject','remove') or s.host_id<>actor then raise exception 'Not authorized' using errcode='42501';end if;
 target:=(p_data->>'target')::uuid;
 if target=actor then raise exception 'Invalid member' using errcode='22023';end if;
 select * into m from public.gaming_session_members where session_id=s.id and user_id=target;
 if not found then raise exception 'Member unavailable' using errcode='42501';end if;
 if p_operation='approve' then
  if m.status<>'pending' or not private.squad_eligible(target,s) or not private.squad_compatible(s,m.platform_id) or exists(select 1 from public.gaming_session_members other where other.session_id=s.id and other.status='accepted' and private.squad_eligible(other.user_id,s) and private.squad_blocked(target,other.user_id)) then raise exception 'Member unavailable' using errcode='42501';end if;
  if (select count(*) from public.gaming_session_members where session_id=s.id and status='accepted')>=s.max_players then raise exception 'Session is full' using errcode='54000';end if;
  desired:='accepted';
 elsif p_operation='reject' then if m.status<>'pending' then raise exception 'Invalid member status' using errcode='22023';end if;desired:='rejected';
 else desired:='removed';end if;
 update public.gaming_session_members set status=desired,updated_at=clock_timestamp() where session_id=s.id and user_id=target;
 delete from private.squad_voice_sessions where session_id=s.id and user_id=target;
 insert into private.squad_audit(session_id,actor_id,target_id,action) values(s.id,actor,target,p_operation);
 return jsonb_build_object('id',s.id);
end $$;


notify pgrst,'reload schema';
