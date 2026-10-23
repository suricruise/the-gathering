-- Community header uploads: pending-only installer. Back up and approve production changes first.
BEGIN;
SELECT pg_advisory_xact_lock(20261030);
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations(version text PRIMARY KEY,statements text[],name text);
REVOKE ALL ON SCHEMA supabase_migrations FROM public,anon,authenticated;
REVOKE ALL ON supabase_migrations.schema_migrations FROM public,anon,authenticated;
DO $preflight$ BEGIN
 IF to_regprocedure('public.operational_health()') IS NULL THEN RAISE EXCEPTION 'Install Phase 12 first.'; END IF;
 IF (to_regclass('public.community_headers') IS NOT NULL OR EXISTS(SELECT 1 FROM storage.buckets WHERE id='community-headers')) AND NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='202611010001') THEN RAISE EXCEPTION 'Community header objects exist without a migration record. Inspect history; no destructive reset was performed.'; END IF;
END $preflight$;
DO $install$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='202611010001') THEN
 EXECUTE $migration$
-- Community headers: private objects, live community access and audited administrator changes.
create table public.community_headers (
 community_id uuid primary key references public.communities(id) on delete cascade,
 version uuid not null unique,
 object_path text not null unique,
 byte_size integer not null check(byte_size between 1 and 3145728)
);
alter table public.community_headers enable row level security;
revoke all on public.community_headers from public,anon,authenticated;
grant select on public.community_headers to authenticated;
create policy community_headers_read on public.community_headers for select to authenticated using(public.community_access(community_id));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('community-headers','community-headers',false,3145728,array['image/webp']);
-- No direct browser object reads or writes. Downloads always recheck community access.
create function public.community_header_command(p_community uuid,p_operation text,p_path text default null,p_version uuid default null,p_size integer default null) returns text
language plpgsql security definer set search_path='' as $$
declare old_path text;begin
 perform pg_advisory_xact_lock(20261030);
 if not private.is_verified_member() or private.community_rank(p_community)<30 or not exists(select 1 from public.communities where id=p_community and not archived) then raise exception 'Not authorized' using errcode='42501';end if;
 perform 1 from public.communities where id=p_community for update;
 if p_operation='check' then
  if not private.take_limit('community-header:'||auth.uid()::text,10,900) then raise exception 'Rate limited' using errcode='42501';end if;
  return 'allowed';
 end if;
 select object_path into old_path from public.community_headers where community_id=p_community;
 if p_operation='save' then
  if not private.take_limit('community-header-save:'||auth.uid()::text,10,900) then raise exception 'Rate limited' using errcode='42501';end if;
  if p_version is null or p_size is null or p_size not between 1 and 3145728 or p_path is distinct from auth.uid()::text||'/'||p_community::text||'/'||p_version::text||'.webp' or not exists(select 1 from storage.objects where bucket_id='community-headers' and name=p_path and created_at>now()-interval '10 minutes' and metadata->>'mimetype'='image/webp' and (metadata->>'size')::bigint=p_size) then raise exception 'Invalid image' using errcode='22023';end if;
  insert into public.community_headers values(p_community,p_version,p_path,p_size) on conflict(community_id) do update set version=excluded.version,object_path=excluded.object_path,byte_size=excluded.byte_size;
 elsif p_operation='remove' then
  if not private.take_limit('community-header:'||auth.uid()::text,10,900) then raise exception 'Rate limited' using errcode='42501';end if;
  delete from public.community_headers where community_id=p_community;
 else raise exception 'Invalid operation' using errcode='22023';end if;
 insert into public.community_audit_log(community_id,actor_id,action,detail) values(p_community,auth.uid(),'community.header.'||p_operation,'{}');
 return old_path;
end$$;
revoke all on function public.community_header_command(uuid,text,text,uuid,integer) from public,anon;
grant execute on function public.community_header_command(uuid,text,text,uuid,integer) to authenticated;
create function public.community_header_orphans() returns table(object_path text) language sql security definer set search_path='' as $$
 select o.name from storage.objects o where o.bucket_id='community-headers' and o.created_at<now()-interval '1 hour' and not exists(select 1 from public.community_headers h where h.object_path=o.name) order by o.created_at limit 200;
$$;
revoke all on function public.community_header_orphans() from public,anon,authenticated;
grant execute on function public.community_header_orphans() to service_role;
create or replace function public.operational_health() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('migration',to_regprocedure('public.account_deletion_ready()') is not null,
 'rls',not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind='r' and not c.relrowsecurity),
 'storage',4=(select count(*) from storage.buckets where id in ('avatars','message-files','social-media','community-headers') and not public),
 'voice_worker',exists(select 1 from private.voice_worker where checked_at>clock_timestamp()-interval '15 seconds'),
 'maintenance',not exists(select 1 from unnest(array['chat_cleanup','social_cleanup','squad_cleanup','moderation_cleanup']) job where not exists(select 1 from private.operational_runs r where r.name=job and r.completed_at>clock_timestamp()-interval '26 hours')));
$$;
notify pgrst,'reload schema';

$migration$;
 INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES('202611010001','community_headers');
 ELSE RAISE NOTICE 'Community header uploads already recorded; skipped.'; END IF;
END $install$;
COMMIT;
