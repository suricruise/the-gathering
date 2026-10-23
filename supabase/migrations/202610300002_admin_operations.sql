create function public.admin_read(p_view text default 'overview',p_community uuid default null,p_before bigint default null,p_search text default '') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare pr integer:=private.platform_rank();cr integer:=private.admin_community_rank(p_community);result jsonb;begin
 if not private.is_verified_member() or length(p_search)>48 or (p_before is not null and p_before<1) then raise exception 'Not authorized' using errcode='42501';end if;
 if p_view='context' then return jsonb_build_object('rank',pr,'communities',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'rank',private.admin_community_rank(c.id),'archived',c.archived) order by c.name) from public.communities c where pr>=20 or private.admin_community_rank(c.id)>=20),'[]'),'retention_days',case when pr>=30 then (select evidence_days from private.admin_settings) else null end);end if;
 if pr<20 and cr<20 then raise exception 'Not authorized' using errcode='42501';end if;
 if not private.take_limit('admin-read:'||auth.uid()::text,300,900) then raise exception 'Rate limited' using errcode='42501';end if;
 if p_view='overview' then return jsonb_build_object('members',(select count(*) from public.profiles p where (p_community is null and pr>=20) or exists(select 1 from public.community_members m where m.user_id=p.id and m.community_id=p_community)),'communities',(select count(*) from public.communities where (p_community is null and pr>=20) or id=p_community),'messages_7d',(select count(*) from public.messages m join public.channels c on c.id=m.channel_id where m.created_at>now()-interval '7 days' and ((p_community is null and pr>=20) or c.community_id=p_community)),'open_reports',(select count(*) from private.moderation_cases c where c.status='open' and private.case_access(c) and (p_community is null or c.community_id=p_community)),'voice_admissions',(select count(*) from private.voice_sessions v join public.channels c on c.id=v.channel_id where v.expires_at>now() and ((p_community is null and pr>=20) or c.community_id=p_community)),'posts_7d',(select count(*) from public.posts where created_at>now()-interval '7 days' and ((p_community is null and pr>=20) or community_id=p_community)));end if;
 if p_view='members' then
 select coalesce(jsonb_agg(x order by x.username),'[]') into result from (select p.id,p.username,p.display_name,case when pr>=20 then case when u.banned_until>now() then 'restricted' else 'active' end else m.status end status,case when pr>=20 then r.role else null end platform_role,m.role_id community_role from public.profiles p join auth.users u on u.id=p.id left join private.platform_roles r on r.user_id=p.id left join public.community_members m on m.user_id=p.id and m.community_id=p_community where ((p_community is null and pr>=20) or m.community_id=p_community) and (p_search='' or p.username ilike replace(replace(p_search,'%',''), '_','')||'%') order by p.username limit 50)x;return result;
 elsif p_view='reports' then
 select coalesce(jsonb_agg(x order by x.seq desc),'[]') into result from (select c.id,c.seq,c.community_id,c.target_type,c.target_id,c.subject_id,c.status,case when c.retain_until>now() then c.reason else 'Report details expired' end reason,case when c.retain_until>now() then c.evidence else null end evidence,c.retain_until,c.reviewed_by,c.reviewed_at,c.created_at from private.moderation_cases c where private.case_access(c) and (p_community is null or c.community_id=p_community) and (p_before is null or c.seq<p_before) order by c.seq desc limit 30)x;
 insert into private.admin_audit(actor_id,community_id,action,reason) values(auth.uid(),p_community,'evidence.review','Opened the scoped moderation queue');return result;
 elsif p_view='audit' then
 select coalesce(jsonb_agg(x order by x.id desc),'[]') into result from (select id,actor_id,community_id,action,target_id,reason,created_at from private.admin_audit where ((p_community is null and pr>=20) or community_id=p_community) and (p_community is null or community_id=p_community) and (p_before is null or id<p_before) order by id desc limit 30)x;return result;
 elsif p_view='appeals' then
 select coalesce(jsonb_agg(x order by x.seq desc),'[]') into result from (select a.* from public.moderation_appeals a left join private.moderation_cases c on c.id=a.case_id where (pr>=30 or (cr>=30 and c.community_id=p_community and c.target_type<>'dm')) and (p_community is null or c.community_id=p_community) and (p_before is null or a.seq<p_before) order by a.seq desc limit 30)x;return result;
 elsif p_view='communities' then
 select coalesce(jsonb_agg(x),'[]') into result from (select c.*,coalesce(s.guidelines,'Be kind. Respect privacy. Welcome others.') guidelines,coalesce(s.allow_events,true) allow_events,coalesce(s.allow_prayers,true) allow_prayers from public.communities c left join public.community_settings s on s.community_id=c.id where ((p_community is null and pr>=20) or c.id=p_community) order by c.name limit 100)x;return result;
 elsif p_view='channels' then
 select coalesce(jsonb_agg(x order by x.position,x.name),'[]') into result from (select c.id,c.community_id,c.name,c.description,c.kind,c.is_private,c.position,c.disabled,v.participant_limit,v.locked,(select coalesce(jsonb_agg(jsonb_build_object('user_id',vs.user_id,'username',p.username)),'[]') from private.voice_sessions vs join public.profiles p on p.id=vs.user_id where vs.channel_id=c.id and vs.expires_at>now()) participants from public.channels c left join public.voice_rooms v on v.channel_id=c.id where c.community_id=p_community order by c.position,c.name limit 200)x;return result;
 elsif p_view='events' then
 select coalesce(jsonb_agg(x order by x.seq desc),'[]') into result from (select id,seq,title,community_id,host_id,status,starts_at,moderation_hidden from public.events where ((p_community is null and pr>=20) or community_id=p_community) and (p_community is null or community_id=p_community) and (p_before is null or seq<p_before) order by seq desc limit 30)x;return result;
 elsif p_view='announcements' then
 select coalesce(jsonb_agg(x),'[]') into result from (select * from public.site_announcements where ((p_community is null and pr>=20) or community_id=p_community) and (p_community is null or community_id=p_community) order by updated_at desc limit 50)x;return result;
 end if;raise exception 'Unknown view' using errcode='22023';end$$;
-- Evidence reads write an audit entry: this RPC must be VOLATILE.
alter function public.admin_read(text,uuid,bigint,text) volatile;
create function public.admin_command(p_operation text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();pr integer;cr integer;cid uuid:=nullif(p_data->>'community_id','')::uuid;tid uuid:=nullif(p_data->>'id','')::uuid;target uuid:=nullif(p_data->>'user_id','')::uuid;why text:=btrim(p_data->>'reason');tr integer;desired text;case_row private.moderation_cases;ch public.channels;aid uuid;begin
 perform pg_advisory_xact_lock(20261030);
 pr:=private.platform_rank();cr:=private.admin_community_rank(cid);
 if not private.is_verified_member() or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>16000 or why is null or length(why) not between 5 and 500 then raise exception 'Invalid or unauthorized action' using errcode='42501';end if;
 if not private.take_limit('admin:'||actor::text,120,900) then raise exception 'Rate limited' using errcode='42501';end if;
 -- Every branch authorizes inside this transaction. No role/id comes from session metadata.
 if p_operation='platform_role' then
  desired:=p_data->>'role';
  if pr<>40 or target=actor or target is null or desired not in ('administrator','moderator','member') or exists(select 1 from private.platform_roles where user_id=target and role='owner') or not private.squad_live(target) then raise exception 'Not authorized' using errcode='42501';end if;
  if desired='member' then delete from private.platform_roles where user_id=target;else insert into private.platform_roles(user_id,role) values(target,desired) on conflict(user_id) do update set role=excluded.role,granted_at=now();end if;
 elsif p_operation='account_status' then
  select case role when 'owner' then 40 when 'administrator' then 30 else 20 end into tr from private.platform_roles where user_id=target;
  if pr<30 or target=actor or target is null or coalesce(tr,0)>=pr or p_data->>'status' not in ('active','suspended','banned') then raise exception 'Not authorized' using errcode='42501';end if;
  update auth.users set banned_until=case p_data->>'status' when 'banned' then 'infinity'::timestamptz when 'suspended' then now()+make_interval(days=>greatest(1,least(365,coalesce((p_data->>'days')::integer,7)))) else null end where id=target and deleted_at is null;
  if not found then raise exception 'Not authorized' using errcode='42501';end if;
  delete from private.voice_sessions where user_id=target;delete from private.squad_voice_sessions where user_id=target;
 elsif p_operation='community' then
  if pr<30 and cr<30 then raise exception 'Not authorized' using errcode='42501';end if;
  if cid is null then
   if pr<30 or target is null or not private.squad_live(target) then raise exception 'Not authorized' using errcode='42501';end if;
   insert into public.communities(slug,name,description,visibility,cover,created_by) values(p_data->>'slug',p_data->>'name',p_data->>'description',p_data->>'visibility','nebula',actor) returning id into cid;
   insert into public.community_members(community_id,user_id,role_id) values(cid,target,'owner');insert into public.channels(community_id,name) values(cid,'general');
  else
   update public.communities set name=p_data->>'name',description=p_data->>'description',visibility=p_data->>'visibility',archived=(p_data->>'archived')::boolean where id=cid;
   if not found then raise exception 'Not authorized' using errcode='42501';end if;
  end if;
 elsif p_operation='community_settings' then
  if pr<30 and cr<30 then raise exception 'Not authorized' using errcode='42501';end if;
  insert into public.community_settings(community_id,guidelines,allow_events,allow_prayers) values(cid,p_data->>'guidelines',(p_data->>'allow_events')::boolean,(p_data->>'allow_prayers')::boolean) on conflict(community_id) do update set guidelines=excluded.guidelines,allow_events=excluded.allow_events,allow_prayers=excluded.allow_prayers;
 elsif p_operation='community_role' then
  select r.rank into tr from public.community_members m join public.community_roles r on r.id=m.role_id where m.user_id=target and m.community_id=cid;
  desired:=p_data->>'role';
  if target=actor or tr is null or desired not in ('administrator','moderator','member') or (pr<30 and (cr<30 or tr>=cr or (select rank from public.community_roles where id=desired)>=cr)) or tr=40 then raise exception 'Not authorized' using errcode='42501';end if;
  update public.community_members set role_id=desired where user_id=target and community_id=cid and status='active';if not found then raise exception 'Not authorized' using errcode='42501';end if;
 elsif p_operation='community_status' then
  select r.rank into tr from public.community_members m join public.community_roles r on r.id=m.role_id where m.user_id=target and m.community_id=cid;
  if target=actor or tr is null or tr=40 or (pr<30 and (cr<20 or tr>=cr)) or p_data->>'status' not in ('active','banned') then raise exception 'Not authorized' using errcode='42501';end if;
  update public.community_members set role_id='member',status=p_data->>'status' where user_id=target and community_id=cid;
 elsif p_operation='channel' then
  if pr<30 and cr<30 then raise exception 'Not authorized' using errcode='42501';end if;
  if tid is null then insert into public.channels(community_id,name,description,kind,is_private,position,disabled) values(cid,p_data->>'name',p_data->>'description',p_data->>'kind',(p_data->>'is_private')::boolean,(p_data->>'position')::integer,(p_data->>'disabled')::boolean) returning id into tid;
  else update public.channels set name=p_data->>'name',description=p_data->>'description',is_private=(p_data->>'is_private')::boolean,position=(p_data->>'position')::integer,disabled=(p_data->>'disabled')::boolean where id=tid and community_id=cid;if not found then raise exception 'Not authorized' using errcode='42501';end if;end if;
 elsif p_operation='channel_access' then
  if pr<30 and cr<30 then raise exception 'Not authorized' using errcode='42501';end if;
  if not exists(select 1 from public.channels where id=tid and community_id=cid) or p_data->>'role' not in ('member','moderator','administrator') then raise exception 'Not authorized' using errcode='42501';end if;
  delete from public.channel_permission_overrides where channel_id=tid and role_id=p_data->>'role';
  if not coalesce((p_data->>'reset')::boolean,false) then insert into public.channel_permission_overrides(community_id,channel_id,role_id,can_view,can_post,can_connect) values(cid,tid,p_data->>'role',(p_data->>'can_view')::boolean,(p_data->>'can_post')::boolean,(p_data->>'can_connect')::boolean);end if;
 elsif p_operation='voice_remove' then
  select * into ch from public.channels where id=tid and community_id=cid and kind='voice';
  select r.rank into tr from public.community_members m join public.community_roles r on r.id=m.role_id where m.community_id=cid and m.user_id=target;
  if ch.id is null or target is null or target=actor or (pr<20 and (cr<20 or coalesce(tr,40)>=cr)) or exists(select 1 from private.platform_roles where user_id=target and (case role when 'owner' then 40 when 'administrator' then 30 else 20 end)>=pr) then raise exception 'Not authorized' using errcode='42501';end if;
  insert into private.voice_suspensions values(tid,target,now()+interval '15 minutes') on conflict(channel_id,user_id) do update set until_at=excluded.until_at;
  delete from private.voice_sessions where channel_id=tid and user_id=target;
 elsif p_operation='event_visibility' then
  if pr<20 and cr<20 then raise exception 'Not authorized' using errcode='42501';end if;
  update public.events set moderation_hidden=(p_data->>'hidden')::boolean where id=tid and community_id=cid;if not found then raise exception 'Not authorized' using errcode='42501';end if;
 elsif p_operation='announcement' then
  if (cid is null and pr<30) or (cid is not null and pr<30 and cr<30) then raise exception 'Not authorized' using errcode='42501';end if;
  if tid is null then tid:=gen_random_uuid();end if;
  if exists(select 1 from public.site_announcements where id=tid and community_id is distinct from cid) then raise exception 'Not authorized' using errcode='42501';end if;
  insert into public.site_announcements(id,title,body,community_id,published,expires_at,created_by) values(tid,p_data->>'title',p_data->>'body',cid,(p_data->>'published')::boolean,(p_data->>'expires_at')::timestamptz,actor) on conflict(id) do update set title=excluded.title,body=excluded.body,published=excluded.published,expires_at=excluded.expires_at,updated_at=now();
 elsif p_operation='retention' then
  if pr<30 then raise exception 'Not authorized' using errcode='42501';end if;
  update private.admin_settings set evidence_days=(p_data->>'days')::integer;
  update private.moderation_cases set retain_until=least(retain_until,created_at+make_interval(days=>(p_data->>'days')::integer));
 elsif p_operation='case_decision' then
  select * into case_row from private.moderation_cases where id=tid for update;
  if not found or not private.case_access(case_row) or case_row.reporter_id=actor or case_row.subject_id=actor or p_data->>'decision' not in ('dismissed','actioned') then raise exception 'Not authorized' using errcode='42501';end if;
  cid:=case_row.community_id;
  if pr<20 and (p_data->>'decision'='actioned' or coalesce((p_data->>'remove')::boolean,false)) and case_row.subject_id is not null and coalesce((select r.rank from public.community_members m join public.community_roles r on r.id=m.role_id where m.community_id=cid and m.user_id=case_row.subject_id),0)>=private.admin_community_rank(cid) then raise exception 'Cannot action a peer or superior' using errcode='42501';end if;
  if coalesce((p_data->>'remove')::boolean,false) then
   if p_data->>'decision'<>'actioned' then raise exception 'Choose actioned before removing content' using errcode='22023';end if;
   if case_row.subject_id is not null and exists(select 1 from private.platform_roles where user_id=case_row.subject_id and (case role when 'owner' then 40 when 'administrator' then 30 else 20 end)>=pr) then raise exception 'Not authorized' using errcode='42501';end if;
   if case_row.target_type='message' then update public.messages set body='',deleted_at=now() where id=case_row.target_id;update public.message_attachments set removed_at=now() where message_id=case_row.target_id;
   elsif case_row.target_type='post' then update public.posts set status='removed',body='' where id=case_row.target_id;update public.post_media set removed_at=now() where post_id=case_row.target_id;
   elsif case_row.target_type='comment' then update public.post_comments set status='removed',body='' where id=case_row.target_id;
   elsif case_row.target_type='session' then update public.gaming_sessions set status='cancelled' where id=case_row.target_id;
   else raise exception 'Use account controls for users; DM evidence is review-only' using errcode='22023';end if;
  end if;
  update private.moderation_cases set status=p_data->>'decision',reviewed_by=actor,reviewed_at=now() where id=tid;
  if case_row.target_type in ('post','comment') then update public.post_reports set status=p_data->>'decision',reviewed_at=now() where (case_row.target_type='post' and post_id=case_row.target_id and comment_id is null) or comment_id=case_row.target_id;
  elsif case_row.target_type='dm' then update public.direct_message_reports set status=p_data->>'decision' where message_id=case_row.target_id;end if;
 elsif p_operation='appeal_decision' then
  select c.* into case_row from public.moderation_appeals a left join private.moderation_cases c on c.id=a.case_id where a.id=tid;
  if pr<30 and (private.admin_community_rank(case_row.community_id)<30 or case_row.target_type='dm') then raise exception 'Not authorized' using errcode='42501';end if;
  if p_data->>'decision' not in ('accepted','declined') or exists(select 1 from public.moderation_appeals where id=tid and user_id=actor) then raise exception 'Not authorized' using errcode='42501';end if;
  update public.moderation_appeals set status=p_data->>'decision',decision=why,reviewed_by=actor,reviewed_at=now() where id=tid and status='pending';if not found then raise exception 'Not authorized' using errcode='42501';end if;cid:=case_row.community_id;
 else raise exception 'Unknown operation' using errcode='22023';end if;
 insert into private.admin_audit(actor_id,community_id,target_id,action,reason) values(actor,cid,coalesce(target,tid),p_operation,why);
 return jsonb_build_object('ok',true,'id',coalesce(tid,cid));end$$;
create function public.submit_appeal(p_body text,p_case uuid default null) returns uuid language plpgsql security definer set search_path='' as $$declare rid uuid;begin
 -- Banned sessions may appeal, but gain no ordinary member or admin access.
 if not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null and deleted_at is null) or length(btrim(p_body)) not between 10 and 2000 or (p_case is not null and not exists(select 1 from private.moderation_cases where id=p_case and subject_id=auth.uid())) then raise exception 'Not authorized' using errcode='42501';end if;
 if not private.take_limit('appeal:'||auth.uid()::text,3,86400) then raise exception 'Rate limited' using errcode='42501';end if;
 insert into public.moderation_appeals(user_id,case_id,body) values(auth.uid(),p_case,btrim(p_body)) returning id into rid;return rid;end$$;
revoke all on function public.admin_read(text,uuid,bigint,text),public.admin_command(text,jsonb),public.submit_appeal(text,uuid) from public,anon,authenticated;
grant execute on function public.admin_read(text,uuid,bigint,text),public.admin_command(text,jsonb),public.submit_appeal(text,uuid) to authenticated;
notify pgrst,'reload schema';
