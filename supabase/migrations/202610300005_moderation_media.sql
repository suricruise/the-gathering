-- Only media attached to a reported item is held; never whole libraries/histories.
create table private.case_media(id uuid primary key default gen_random_uuid(),case_id uuid not null references private.moderation_cases on delete cascade,bucket text not null check(bucket in ('message-files','social-media')),storage_path text not null,mime text not null,filename text not null,unique(case_id,bucket,storage_path));
create index case_media_hold on private.case_media(bucket,storage_path);
alter table private.case_media enable row level security;
revoke all on private.case_media from public,anon,authenticated;
create function private.capture_case_media() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.target_type='message' then
  perform 1 from public.message_attachments where message_id=new.target_id and removed_at is null order by id for update;
  insert into private.case_media(case_id,bucket,storage_path,mime,filename) select new.id,'message-files',storage_path,mime,filename from public.message_attachments where message_id=new.target_id and removed_at is null limit 4;
 elsif new.target_type='post' then
  perform 1 from public.post_media where post_id=new.target_id and removed_at is null order by id for update;
  insert into private.case_media(case_id,bucket,storage_path,mime,filename) select new.id,'social-media',storage_path,mime,filename from public.post_media where post_id=new.target_id and removed_at is null limit 4;
 end if;return new;end$$;
create trigger capture_case_media after insert on private.moderation_cases for each row execute function private.capture_case_media();
insert into private.case_media(case_id,bucket,storage_path,mime,filename)
 select c.id,'message-files',a.storage_path,a.mime,a.filename from private.moderation_cases c join public.message_attachments a on a.message_id=c.target_id where c.target_type='message' and c.retain_until>now() and a.removed_at is null
 union all select c.id,'social-media',m.storage_path,m.mime,m.filename from private.moderation_cases c join public.post_media m on m.post_id=c.target_id where c.target_type='post' and c.retain_until>now() and m.removed_at is null on conflict do nothing;
create function private.evidence_hold(b text,p text) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from private.case_media m join private.moderation_cases c on c.id=m.case_id where m.bucket=b and m.storage_path=p and c.retain_until>now())$$;
create function public.admin_evidence_file(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare m private.case_media;c private.moderation_cases;begin
 select * into m from private.case_media where id=p_id;select * into c from private.moderation_cases where id=m.case_id;
 if c.id is null or not private.case_access(c) or c.retain_until<=now() then raise exception 'Not authorized' using errcode='42501';end if;
 if not private.take_limit('evidence:'||auth.uid()::text,120,900) then raise exception 'Rate limited' using errcode='42501';end if;
 insert into private.admin_audit(actor_id,community_id,target_id,action,reason) values(auth.uid(),c.community_id,c.id,'evidence.file','Opened media attached to a reported item');
 return jsonb_build_object('bucket',m.bucket,'storage_path',m.storage_path,'mime',m.mime,'filename',m.filename);end$$;
-- Keep the versioned read/cleanup bodies inspectable below; no public file URLs.
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
 select coalesce(jsonb_agg(x order by x.position,x.name),'[]') into result from (select c.id,c.community_id,c.name,c.description,c.kind,c.is_private,c.position,c.disabled,v.participant_limit,v.locked,(select coalesce(jsonb_agg(jsonb_build_object('user_id',vs.user_id,'username',p.username)),'[]') from private.voice_sessions vs join public.profiles p on p.id=vs.user_id where vs.channel_id=c.id and vs.expires_at>now()) participants from public.channels c left join public.voice_rooms v on v.channel_id=c.id where c.community_id=p_community order by c.position,c.name limit 200)x;return result;
 elsif p_view='events' then
 select coalesce(jsonb_agg(x order by x.seq desc),'[]') into result from (select id,seq,title,community_id,host_id,status,starts_at,moderation_hidden from public.events where ((p_community is null and pr>=20) or community_id=p_community) and (p_community is null or community_id=p_community) and (p_before is null or seq<p_before) order by seq desc limit 30)x;return result;
 elsif p_view='announcements' then
 select coalesce(jsonb_agg(x),'[]') into result from (select * from public.site_announcements where ((p_community is null and pr>=20) or community_id=p_community) and (p_community is null or community_id=p_community) order by updated_at desc limit 50)x;return result;
 end if;raise exception 'Unknown view' using errcode='22023';end$$;
-- Claim files before Storage deletion so an expired staged file cannot be attached
-- concurrently. Missing metadata after a deleted community is also cleaned up.
create or replace function public.chat_cleanup_files(p_user uuid default null,p_limit integer default 500)
returns table(id uuid,storage_path text)
language plpgsql security definer set search_path='' as $$
declare selected uuid[];
begin
 -- Match the channel lock order used by sends, edits, and account cleanup.
 perform 1 from public.channels where public.channels.id in (
  select a.channel_id from public.message_attachments a left join public.messages m on m.id=a.message_id
  where not private.evidence_hold('message-files',a.storage_path) and case when p_user is not null then a.author_id=p_user
  else (a.message_id is null and a.created_at<now()-interval '24 hours') or m.deleted_at is not null end
 ) order by public.channels.id for update;
 select array_agg(x.id) into selected from (
  select a.id from public.message_attachments a join storage.objects o on o.bucket_id='message-files' and o.name=a.storage_path
  left join public.messages m on m.id=a.message_id
  where not private.evidence_hold('message-files',a.storage_path) and case when p_user is not null then a.author_id=p_user
  else (a.message_id is null and a.created_at<now()-interval '24 hours') or m.deleted_at is not null end
  order by a.created_at,a.id limit least(greatest(p_limit,1),500) for update of a skip locked
 ) x;
 update public.message_attachments a set removed_at=coalesce(a.removed_at,now()) where a.id=any(selected);
 return query
 select a.id,a.storage_path from public.message_attachments a where a.id=any(selected)
 union all
 select o.id,o.name from storage.objects o where o.bucket_id='message-files'
 and not private.evidence_hold('message-files',o.name) and not exists(select 1 from public.message_attachments a where a.storage_path=o.name)
 and (case when p_user is not null then split_part(o.name,'/',2)=p_user::text else o.created_at<now()-interval '24 hours' end)
 limit least(greatest(p_limit,1),500);
end $$;
create or replace function public.social_cleanup_files(p_user uuid default null,p_limit integer default 500) returns table(id uuid,storage_path text) language plpgsql security definer set search_path='' as $$
declare selected uuid[];
begin
 select array_agg(x.id) into selected from (select m.id from public.post_media m join storage.objects o on o.bucket_id='social-media' and o.name=m.storage_path
 where not private.evidence_hold('social-media',m.storage_path) and (case when p_user is not null then m.author_id=p_user else m.removed_at is not null or (m.post_id is null and m.created_at<now()-interval '24 hours') end)
 order by m.created_at,m.id limit least(greatest(p_limit,1),500) for update of m skip locked)x;
 update public.post_media m set removed_at=coalesce(m.removed_at,now()) where m.id=any(selected);
 return query select m.id,m.storage_path from public.post_media m where m.id=any(selected)
 union all select o.id,o.name from storage.objects o where o.bucket_id='social-media' and not private.evidence_hold('social-media',o.name) and not exists(select 1 from public.post_media m where m.storage_path=o.name)
 and (case when p_user is not null then split_part(o.name,'/',1)=p_user::text else o.created_at<now()-interval '24 hours' end) limit least(greatest(p_limit,1),500);
end $$;
create or replace function public.moderation_cleanup() returns integer language plpgsql security definer set search_path='' as $$declare n integer;begin
 delete from private.case_media m using private.moderation_cases c where c.id=m.case_id and c.retain_until<=now();
 update private.moderation_cases set evidence=null,reason='Report details expired' where retain_until<=now() and (evidence is not null or reason<>'Report details expired');get diagnostics n=row_count;
 update public.moderation_appeals set body='Appeal details expired',decision=null where created_at<now()-interval '365 days' and status<>'pending';return n;end$$;
revoke all on function private.capture_case_media(),private.evidence_hold(text,text),public.admin_evidence_file(uuid) from public,anon,authenticated;
grant execute on function public.admin_evidence_file(uuid) to authenticated;
notify pgrst,'reload schema';
