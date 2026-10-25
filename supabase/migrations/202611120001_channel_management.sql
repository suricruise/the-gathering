-- Stage 8: additive channel lifecycle and scoped posting restrictions. No records are removed.
alter table public.channels add column archived_at timestamptz, add column deleted_at timestamptz,
 add column attachment_policy text not null default 'posters' check(attachment_policy in ('posters','staff','none')),
 add column notification_default text not null default 'inherit' check(notification_default in ('inherit','all','mentions','muted'));
create table private.community_posting_restrictions(
 community_id uuid not null references public.communities on delete cascade,
 user_id uuid not null references auth.users on delete cascade,
 until_at timestamptz not null, actor_id uuid references auth.users on delete set null,
 reason text not null check(length(reason) between 5 and 500), primary key(community_id,user_id));
alter table private.community_posting_restrictions enable row level security;
revoke all on private.community_posting_restrictions from public,anon,authenticated;
create index community_restrictions_expiry on private.community_posting_restrictions(until_at);
create index channels_category_order on public.channels(community_id,category_id,position,name) where deleted_at is null;

-- Keep the function OID used by existing RLS policies. View/connect retain their existing semantics.
create or replace function public.channel_access(p_channel uuid,p_permission text default 'view') returns boolean language sql stable security definer set search_path='' as $$
 select p_permission in ('view','post','connect','attach') and coalesce(exists(select 1 from public.channels c join public.communities g on g.id=c.community_id
 where c.id=p_channel and not c.disabled and not g.archived and c.archived_at is null and c.deleted_at is null
 and public.phase10_channel_access(p_channel,case when p_permission='attach' then 'post' else p_permission end)
 and (p_permission not in ('post','attach') or not exists(select 1 from private.community_posting_restrictions r where r.community_id=c.community_id and r.user_id=auth.uid() and r.until_at>now()))
 and (p_permission<>'attach' or (c.attachment_policy<>'none' and (c.attachment_policy='posters' or private.community_rank(c.community_id)>=20)))),false);
$$;
create or replace function private.channel_user_allowed(u uuid,cid uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.channels where id=cid and not disabled and archived_at is null and deleted_at is null) and private.phase10_channel_user_allowed(u,cid)$$;
create or replace function private.voice_allowed(p_user uuid,p_channel uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.channels c join public.communities g on g.id=c.community_id where c.id=p_channel and not c.disabled and c.archived_at is null and c.deleted_at is null and not g.archived) and private.phase10_voice_allowed(p_user,p_channel)$$;
-- Recheck after acquiring the write lock: a concurrent permission change must win before sending.
create or replace function private.chat_require(p_channel uuid,p_permission text default 'view') returns void language plpgsql security definer set search_path='' as $$begin
 perform 1 from public.communities c join public.channels ch on ch.community_id=c.id where ch.id=p_channel for key share of c;
 if not found or not coalesce(public.channel_access(p_channel,p_permission),false) or not exists(select 1 from public.channels where id=p_channel and kind='text') then raise exception 'Channel unavailable' using errcode='42501';end if;
 perform 1 from public.channels where id=p_channel for update;
 if not found or not coalesce(public.channel_access(p_channel,p_permission),false) or not exists(select 1 from public.channels where id=p_channel and kind='text') then raise exception 'Channel unavailable' using errcode='42501';end if;
end$$;
-- Both registration and assignment to a message are protected, including files staged before a policy change.
create function private.channel_attachment_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 if current_setting('role',true)='authenticated' and (tg_op='INSERT' or (new.message_id is distinct from old.message_id and new.message_id is not null)) then
  perform private.chat_require(new.channel_id,'attach');
  if new.author_id is distinct from auth.uid() then raise exception 'File unavailable' using errcode='42501';end if;
 end if;return new;
end$$;
create trigger channel_attachment_guard before insert or update of message_id on public.message_attachments for each row execute function private.channel_attachment_guard();
create or replace function private.chat_delivery_mode(u uuid,c uuid) returns text language sql stable security definer set search_path='' as $$
 select case when coalesce(cm.mode,'inherit')='muted' then 'muted' else coalesce(nullif(ch.mode,'inherit'),nullif(cm.mode,'inherit'),c0.notification_default) end from public.channels c0 left join public.chat_notification_settings ch on ch.user_id=u and ch.channel_id=c0.id left join public.chat_notification_settings cm on cm.user_id=u and cm.community_id=c0.community_id and cm.channel_id is null where c0.id=c;
$$;
-- Rotate old private topics for lifecycle/policy changes, including legacy administrative writes.
create trigger channel_management_changed before update of archived_at,deleted_at,attachment_policy on public.channels for each row execute function private.chat_channel_changed();
create function public.channel_management(p_community uuid,p_operation text default 'read',p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare pr integer;cr integer;target_rank integer;target_platform integer;ch public.channels;cid uuid;uid uuid;why text;until_time timestamptz;begin
 perform pg_advisory_xact_lock(20261030);
 pr:=private.platform_rank();cr:=private.community_rank(p_community);
 if not private.squad_live(auth.uid()) or (pr<30 and cr<20) or not exists(select 1 from public.communities where id=p_community and not archived) then raise exception 'Management unavailable' using errcode='42501';end if;
 if p_operation='read' then return jsonb_build_object('community_slug',(select slug from public.communities where id=p_community),'can_manage',pr>=30 or cr>=30,'categories',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'position',position) order by position,name) from public.channel_categories where community_id=p_community),'[]'),'members',coalesce((select jsonb_agg(to_jsonb(m)) from (select cm.user_id,p.username,p.display_name from public.community_members cm join public.profiles p on p.id=cm.user_id where cm.community_id=p_community and cm.status='active' order by p.username limit 200)m),'[]'),'channels',coalesce((select jsonb_agg(to_jsonb(c) - 'realtime_epoch' order by c.position,c.name) from public.channels c where c.community_id=p_community and c.deleted_at is null and (pr>=30 or cr>=30 or public.channel_access(c.id))),'[]'), 'restrictions',coalesce((select jsonb_agg(jsonb_build_object('user_id',r.user_id,'until_at',r.until_at)) from private.community_posting_restrictions r where r.community_id=p_community and r.until_at>now()),'[]'));end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>8000 then raise exception 'Invalid settings' using errcode='22023';end if;
 why:=btrim(p_data->>'reason');if why is null or length(why) not between 5 and 500 then raise exception 'A reason of 5–500 characters is required' using errcode='22023';end if;
 if not private.take_limit('channel-management:'||auth.uid()::text,60,900) then raise exception 'Please wait before making more changes' using errcode='P0001';end if;
 -- The community row is the shared lock used by membership changes and sends.
 perform 1 from public.communities where id=p_community for update;
 if p_operation in ('restrict','unrestrict') then
  uid:=(p_data->>'user_id')::uuid;
  select r.rank into target_rank from public.community_members m join public.community_roles r on r.id=m.role_id where m.community_id=p_community and m.user_id=uid and m.status='active';
  select coalesce((select case role when 'owner' then 40 when 'administrator' then 30 else 20 end from private.platform_roles where user_id=uid),0) into target_platform;
  if uid=auth.uid() or target_rank is null or (target_platform>0 and target_platform>=pr) or (pr<30 and target_rank>=cr) or target_rank=40 then raise exception 'Member cannot be restricted' using errcode='42501';end if;
  if p_operation='restrict' then
   if (p_data->>'minutes')::integer not between 1 and 10080 or p_data->>'minutes' is null then raise exception 'Choose 1 minute to 7 days' using errcode='22023';end if;
   until_time:=now()+make_interval(mins=>(p_data->>'minutes')::integer);
   insert into private.community_posting_restrictions values(p_community,uid,until_time,auth.uid(),why) on conflict(community_id,user_id) do update set until_at=excluded.until_at,actor_id=excluded.actor_id,reason=excluded.reason;
  else delete from private.community_posting_restrictions where community_id=p_community and user_id=uid;end if;
  perform private.chat_rotate_community(p_community);
 else
  if pr<30 and cr<30 then raise exception 'Channel settings require an administrator' using errcode='42501';end if;
  cid:=nullif(p_data->>'id','')::uuid;
  if p_operation='category' then
   if p_data->>'name' is null or length(btrim(p_data->>'name')) not between 1 and 60 then raise exception 'Invalid category name' using errcode='22023';end if;
   if cid is null then insert into public.channel_categories(community_id,name,position) values(p_community,p_data->>'name',(p_data->>'position')::integer) returning id into cid;
   else update public.channel_categories set name=p_data->>'name',position=(p_data->>'position')::integer where id=cid and community_id=p_community;
    if not found then raise exception 'Category unavailable' using errcode='42501';end if;
   end if;
  elsif p_operation='save' and cid is null then
   insert into public.channels(community_id,name,description,kind,category_id,position,is_private,attachment_policy,notification_default)
   values(p_community,p_data->>'name',coalesce(p_data->>'description',''),p_data->>'kind',nullif(p_data->>'category_id','')::uuid,(p_data->>'position')::integer,(p_data->>'is_private')::boolean,p_data->>'attachment_policy',p_data->>'notification_default') returning id into cid;
  else
   select * into ch from public.channels where id=cid and community_id=p_community and deleted_at is null for update;
   if not found then raise exception 'Channel unavailable' using errcode='42501';end if;
   if p_operation='save' then
    if p_data->>'kind' is distinct from ch.kind then raise exception 'Channel type cannot be changed' using errcode='22023';end if;
    update public.channels set name=p_data->>'name',description=coalesce(p_data->>'description',''),category_id=nullif(p_data->>'category_id','')::uuid,position=(p_data->>'position')::integer,is_private=(p_data->>'is_private')::boolean,attachment_policy=p_data->>'attachment_policy',notification_default=p_data->>'notification_default' where id=cid;
   elsif p_operation in ('archive','restore','delete') then
    if p_data->>'confirmation' is distinct from ch.name then raise exception 'Type the channel name to confirm' using errcode='22023';end if;
    if p_operation<>'restore' and ch.kind='text' and ch.archived_at is null and not exists(select 1 from public.channels where community_id=p_community and id<>cid and kind='text' and not disabled and archived_at is null and deleted_at is null) then raise exception 'Keep at least one active text channel' using errcode='22023';end if;
    if p_operation='delete' then
     if ch.archived_at is null or exists(select 1 from public.messages where channel_id=cid) or exists(select 1 from public.message_attachments where channel_id=cid) or exists(select 1 from private.voice_sessions where channel_id=cid and expires_at>now()) or exists(select 1 from public.events where voice_channel_id=cid) then raise exception 'Only archived empty, unlinked channels can be deleted' using errcode='22023';end if;
     update public.channels set deleted_at=now(),disabled=true where id=cid;
    elsif p_operation='archive' then update public.channels set archived_at=now(),disabled=true where id=cid;
    else update public.channels set archived_at=null,disabled=false where id=cid;end if;
   else raise exception 'Unknown operation' using errcode='22023';end if;
  end if;
  if exists(select 1 from public.channels where id=cid and kind='voice') then insert into public.voice_rooms(channel_id) values(cid) on conflict do nothing;end if;
 end if;
 insert into private.admin_audit(actor_id,community_id,action,target_id,reason) values(auth.uid(),p_community,'channel_'||p_operation,coalesce(uid,cid),why);
 insert into public.community_audit_log(community_id,actor_id,target_id,action,detail) values(p_community,auth.uid(),uid,'channel_'||p_operation,jsonb_build_object('channel_id',cid,'reason',why,'until_at',until_time));
 return jsonb_build_object('saved',true);
end$$;
revoke all on function private.channel_attachment_guard(),public.channel_management(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.channel_management(uuid,text,jsonb) to authenticated;
create or replace function public.chat_session(p_channel uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if not public.channel_access(p_channel) then raise exception 'Channel unavailable' using errcode='42501';end if;
 return jsonb_build_object('topic',private.chat_topic(p_channel),'can_post',public.channel_access(p_channel,'post'),'can_attach',public.channel_access(p_channel,'attach'),'role',public.community_my_role((select community_id from public.channels where id=p_channel)));
end$$;
-- Preserve existing administrative evidence/role checks; hide deleted tombstones from its channel list.
create or replace function public.admin_read(p_view text default 'overview',p_community uuid default null,p_before bigint default null,p_search text default '') returns jsonb language plpgsql security definer set search_path='' as $$
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
 select coalesce(jsonb_agg(x order by x.position,x.name),'[]') into result from (select c.id,c.community_id,c.name,c.description,c.kind,c.is_private,c.position,c.disabled,c.archived_at,v.participant_limit,v.locked,(select coalesce(jsonb_agg(jsonb_build_object('user_id',vs.user_id,'username',p.username)),'[]') from private.voice_sessions vs join public.profiles p on p.id=vs.user_id where vs.channel_id=c.id and vs.expires_at>now()) participants from public.channels c left join public.voice_rooms v on v.channel_id=c.id where c.community_id=p_community and c.deleted_at is null order by c.position,c.name limit 200)x;return result;
 elsif p_view='events' then
 select coalesce(jsonb_agg(x order by x.seq desc),'[]') into result from (select id,seq,title,community_id,host_id,status,starts_at,moderation_hidden from public.events where ((p_community is null and pr>=20) or community_id=p_community) and (p_community is null or community_id=p_community) and (p_before is null or seq<p_before) order by seq desc limit 30)x;return result;
 elsif p_view='announcements' then
 select coalesce(jsonb_agg(x),'[]') into result from (select * from public.site_announcements where ((p_community is null and pr>=20) or community_id=p_community) and (p_community is null or community_id=p_community) order by updated_at desc limit 50)x;return result;
 end if;raise exception 'Unknown view' using errcode='22023';end$$;

notify pgrst,'reload schema';
