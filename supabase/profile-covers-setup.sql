BEGIN;
SELECT pg_advisory_xact_lock(20261030);
DO $install$ BEGIN
 IF to_regclass('supabase_migrations.schema_migrations') IS NULL OR NOT EXISTS(select 1 from supabase_migrations.schema_migrations where version='202611240001')THEN RAISE EXCEPTION 'Verify the Scripture migration history first.';END IF;
 IF NOT EXISTS(select 1 from supabase_migrations.schema_migrations where version='202611250001')THEN
  IF to_regclass('public.profile_covers')IS NOT NULL OR to_regprocedure('public.set_profile_cover(uuid,text,text)')IS NOT NULL OR to_regprocedure('public.visible_profile_cover(uuid)')IS NOT NULL THEN RAISE EXCEPTION 'Profile cover objects exist without a migration record. Inspect history; do not reset.';END IF;
  EXECUTE $migration$
-- Additive personal profile covers. Existing private avatars storage is reused:
-- only trusted servers can write it, and existing account deletion removes all
-- objects under the authenticated member's folder, including cover files.
create table public.profile_covers (
 user_id uuid primary key references auth.users(id) on delete cascade,
 path text not null unique,
 updated_at timestamptz not null default now(),
 check(path ~ ('^' || user_id::text || '/cover-[a-f0-9-]{36}\.webp$'))
);
alter table public.profile_covers enable row level security;
revoke all on public.profile_covers from public,anon,authenticated;
grant all on public.profile_covers to service_role;

create function public.visible_profile_cover(p_id uuid) returns text
language sql stable security definer set search_path='' as $$
 select c.path from public.profile_covers c join public.profiles p on p.id=c.user_id
 where c.user_id=p_id and private.squad_live(auth.uid()) and private.squad_live(p_id)
 and (p_id=auth.uid() or (not private.squad_blocked(auth.uid(),p_id)
 and exists(select 1 from public.visible_profile(p.username) v where v.id=p_id)));
$$;
revoke all on function public.visible_profile_cover(uuid) from public,anon,authenticated;
grant execute on function public.visible_profile_cover(uuid) to authenticated;

-- The caller is the server service client, after verified getUser identity.
-- Never grant browsers this function or accept a submitted actor ID in an action.
create function public.set_profile_cover(p_user uuid,p_path text,p_expected text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare old_path text;
begin
 if not private.squad_live(p_user) then raise exception 'Unavailable' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('profile-cover:'||p_user::text,0));
 select path into old_path from public.profile_covers where user_id=p_user for update;
 if old_path is distinct from p_expected then raise exception 'Profile cover changed. Refresh and retry.' using errcode='40001';end if;
 if not private.take_limit('profile-cover:'||p_user::text,12,900)then raise exception 'Retry later'using errcode='42501';end if;
 if p_path is null then
  delete from public.profile_covers where user_id=p_user;
 else
  if p_path !~ ('^'||p_user::text||'/cover-[a-f0-9-]{36}\.webp$') or not exists(
   select 1 from storage.objects o where o.bucket_id='avatars' and o.name=p_path
   and o.metadata->>'mimetype'='image/webp'
   and (o.metadata->>'size')::bigint between 1 and 2097152
  ) then raise exception 'Invalid profile cover'using errcode='22023';end if;
  insert into public.profile_covers(user_id,path)values(p_user,p_path)
  on conflict(user_id)do update set path=excluded.path,updated_at=now();
 end if;
 return jsonb_build_object('previous',old_path);
end$$;
revoke all on function public.set_profile_cover(uuid,text,text) from public,anon,authenticated;
grant execute on function public.set_profile_cover(uuid,text,text) to service_role;

notify pgrst,'reload schema';

$migration$;
  INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('202611250001','profile_covers',ARRAY['Applied through reviewed profile-covers setup.']);
 END IF;
END $install$;
NOTIFY pgrst,'reload schema';
COMMIT;
