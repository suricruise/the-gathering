-- The Gathering: ONE-TIME initial setup for a fresh Supabase project.
-- Run this entire file in Supabase Dashboard > SQL Editor as the project owner.
-- Do not run if any application migration has already been applied.
-- Generated from the four immutable versioned migrations below.
-- This transaction either applies everything or rolls everything back.
BEGIN;
DO $$ BEGIN
 IF to_regclass('public.profiles') IS NOT NULL
 OR to_regclass('public.user_preferences') IS NOT NULL
 OR to_regclass('public.games') IS NOT NULL
 OR to_regclass('public.platforms') IS NOT NULL
 OR to_regclass('public.user_games') IS NOT NULL
 OR to_regclass('public.user_platforms') IS NOT NULL THEN
  RAISE EXCEPTION 'Application tables already exist. Apply only pending versioned migrations instead of initial-setup.sql.';
 END IF;
END $$;
-- 202610220001_profiles.sql
-- Identity belongs to auth.users. No application password or role column exists.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.account_security (
 user_id uuid primary key references auth.users(id) on delete cascade,
 date_of_birth date not null,
 adult_verified_at timestamptz not null default now()
);
create table private.rate_limits (
 key text primary key,
 window_start timestamptz not null default now(),
 attempts integer not null default 0
);
alter table private.account_security enable row level security;
alter table private.rate_limits enable row level security;
revoke all on all tables in schema private from public, anon, authenticated;

create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 username text unique check (username is null or (username ~ '^[a-z][a-z0-9_]{2,23}$' and username not in ('admin','administrator','support','moderator','the_gathering','api','auth','settings','deleted'))),
 display_name text not null default '' check (char_length(display_name) <= 60),
 bio text not null default '' check (char_length(bio) <= 500),
 visibility text not null default 'private' check (visibility in ('private','members','public')),
 avatar_path text check (avatar_path is null or avatar_path ~ ('^' || id::text || '/[a-f0-9-]{36}\.webp$')),
 onboarding_completed_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table public.user_preferences (
 user_id uuid primary key references auth.users(id) on delete cascade,
 interests text[] not null default '{}' check (cardinality(interests) <= 8 and interests <@ array['casual','competitive','co-op','creative','faith','conversation','events','streaming']::text[]),
 event_reminders boolean not null default false,
 show_gaming_activity boolean not null default false
);
create table public.games (
 id text primary key check (id ~ '^[a-z0-9-]+$'),
 name text not null unique
);
create table public.platforms (
 id text primary key check (id ~ '^[a-z0-9-]+$'),
 name text not null unique
);
create table public.user_games (
 user_id uuid not null references auth.users(id) on delete cascade,
 game_id text not null references public.games(id),
 primary key(user_id, game_id)
);
create table public.user_platforms (
 user_id uuid not null references auth.users(id) on delete cascade,
 platform_id text not null references public.platforms(id),
 primary key(user_id, platform_id)
);
insert into public.games(id,name) values ('valorant','Valorant'),('minecraft','Minecraft'),('destiny-2','Destiny 2'),('rocket-league','Rocket League'),('apex-legends','Apex Legends'),('stardew-valley','Stardew Valley'),('fortnite','Fortnite'),('other','Something else');
insert into public.platforms(id,name) values ('pc','PC'),('playstation','PlayStation'),('xbox','Xbox'),('switch','Nintendo Switch'),('mobile','Mobile');

alter table public.profiles enable row level security;
alter table public.user_preferences enable row level security;
alter table public.user_games enable row level security;
alter table public.user_platforms enable row level security;
alter table public.games enable row level security;
alter table public.platforms enable row level security;

-- No anonymous profile listing or username availability endpoint. Mutations go
-- through scoped, validated RPCs; authenticated callers cannot set identity,
-- adult status, completion timestamps, or privileged fields directly.
revoke all on public.profiles, public.user_preferences, public.user_games, public.user_platforms from anon, authenticated;
grant select on public.profiles, public.user_preferences, public.user_games, public.user_platforms to authenticated;
create policy profiles_owner_read on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy preferences_owner_read on public.user_preferences for select to authenticated using (user_id = (select auth.uid()));
create policy games_owner_read on public.user_games for select to authenticated using (user_id = (select auth.uid()));
create policy platforms_owner_read on public.user_platforms for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.games, public.platforms from anon, authenticated;
grant select on public.games, public.platforms to anon, authenticated;
create policy game_catalog_read on public.games for select to anon, authenticated using (true);
create policy platform_catalog_read on public.platforms for select to anon, authenticated using (true);

create function private.bootstrap_member() returns trigger
language plpgsql security definer set search_path = '' as $$
declare dob date;
begin
 if coalesce(new.raw_user_meta_data->>'date_of_birth','') !~ '^\d{4}-\d{2}-\d{2}$' then
  raise exception 'An eligible date of birth is required';
 end if;
 dob := (new.raw_user_meta_data->>'date_of_birth')::date;
 if dob > (current_date - interval '18 years')::date or dob < (current_date - interval '120 years')::date then
  raise exception 'You must be at least 18 to join';
 end if;
 insert into private.account_security(user_id,date_of_birth) values(new.id,dob);
 insert into public.profiles(id) values(new.id);
 insert into public.user_preferences(user_id) values(new.id);
 return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.bootstrap_member();

create function private.take_limit(limit_key text, max_attempts integer, seconds integer) returns boolean
language plpgsql security definer set search_path = '' as $$
declare result integer;
begin
 insert into private.rate_limits(key,attempts) values(limit_key,1)
 on conflict(key) do update set
 attempts = case when private.rate_limits.window_start < now() - make_interval(secs => seconds) then 1 else private.rate_limits.attempts + 1 end,
 window_start = case when private.rate_limits.window_start < now() - make_interval(secs => seconds) then now() else private.rate_limits.window_start end
 returning attempts into result;
 return result <= max_attempts;
end $$;

-- Service-only limiter. Keys are HMAC digests, never raw emails or passwords.
create function public.consume_auth_rate_limit(digest text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
 if digest !~ '^[a-f0-9]{64}$' then return false; end if;
 return private.take_limit('auth:' || digest, 8, 900);
end $$;
revoke all on function public.consume_auth_rate_limit(text) from public, anon, authenticated;
grant execute on function public.consume_auth_rate_limit(text) to service_role;

create function public.save_my_profile(
 p_username text, p_display_name text, p_bio text, p_visibility text,
 p_interests text[], p_games text[], p_platforms text[], p_complete boolean default false
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid();
begin
 if caller is null or not exists(select 1 from private.account_security where user_id=caller) or
 not exists(select 1 from auth.users where id=caller and email_confirmed_at is not null) then return false; end if;
 -- Return failures instead of throwing so failed unique checks still consume
 -- a rate-limit attempt. There is no user lookup/availability RPC.
 if not private.take_limit('profile:' || caller::text, 12, 900) then return false; end if;
 if p_username is null or p_username !~ '^[a-z][a-z0-9_]{2,23}$' or
 p_username in ('admin','administrator','support','moderator','the_gathering','api','auth','settings','deleted') or
 p_display_name is null or char_length(trim(p_display_name)) not between 1 and 60 or
 p_bio is null or char_length(p_bio)>500 or p_visibility is null or p_visibility not in ('private','members','public') or
 p_interests is null or cardinality(p_interests)>8 or not (p_interests <@ array['casual','competitive','co-op','creative','faith','conversation','events','streaming']::text[]) or
 array_position(p_interests,null) is not null or
 p_games is null or cardinality(p_games)>12 or array_position(p_games,null) is not null or
 p_platforms is null or cardinality(p_platforms)>5 or array_position(p_platforms,null) is not null or
 exists(select 1 from unnest(p_games) g where not exists(select 1 from public.games where id=g)) or
 exists(select 1 from unnest(p_platforms) p where not exists(select 1 from public.platforms where id=p)) or
 (p_complete and (cardinality(p_games)<1 or cardinality(p_platforms)<1 or cardinality(p_interests)<1)) then return false; end if;
 begin
  update public.profiles set username=p_username, display_name=trim(p_display_name),bio=p_bio,visibility=p_visibility,
   onboarding_completed_at=case when p_complete then coalesce(onboarding_completed_at,now()) else onboarding_completed_at end,
   updated_at=now() where id=caller;
  update public.user_preferences set interests=p_interests where user_id=caller;
  delete from public.user_games where user_id=caller;
  insert into public.user_games(user_id,game_id) select caller,g from (select distinct unnest(p_games) g) s;
  delete from public.user_platforms where user_id=caller;
  insert into public.user_platforms(user_id,platform_id) select caller,p from (select distinct unnest(p_platforms) p) s;
 exception when unique_violation or check_violation or foreign_key_violation then return false;
 end;
 return true;
end $$;
revoke all on function public.save_my_profile(text,text,text,text,text[],text[],text[],boolean) from public, anon;
grant execute on function public.save_my_profile(text,text,text,text,text[],text[],text[],boolean) to authenticated;

create function public.save_my_preferences(p_event_reminders boolean,p_show_activity boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null or p_event_reminders is null or p_show_activity is null then return false; end if;
 update public.user_preferences set event_reminders=p_event_reminders,show_gaming_activity=p_show_activity where user_id=auth.uid();
 return found;
end $$;
revoke all on function public.save_my_preferences(boolean,boolean) from public, anon;
grant execute on function public.save_my_preferences(boolean,boolean) to authenticated;

-- Explicit, minimal opt-in projection. Email, DOB, preferences, auth metadata,
-- timestamps and private profile rows never leave this function.
create function public.visible_profile(p_username text)
returns table(id uuid,username text,display_name text,bio text,visibility text,has_avatar boolean,favorite_games text[],gaming_platforms text[])
language sql stable security definer set search_path = '' as $$
 select p.id,p.username,p.display_name,p.bio,p.visibility,p.avatar_path is not null,
 array(select g.name from public.user_games ug join public.games g on g.id=ug.game_id where ug.user_id=p.id),
 array(select x.name from public.user_platforms up join public.platforms x on x.id=up.platform_id where up.user_id=p.id)
 from public.profiles p where p.username=p_username and p.onboarding_completed_at is not null
 and (p.id=auth.uid() or p.visibility='public' or (p.visibility='members' and auth.uid() is not null));
$$;
revoke all on function public.visible_profile(text) from public;
grant execute on function public.visible_profile(text) to anon, authenticated;

-- No anonymous access to private-schema helpers, even if guessed by name.
revoke all on all functions in schema private from public, anon, authenticated;

-- 202610220002_avatars.sql
-- Private bucket. Only the trusted upload server may write transformed images.
-- There are deliberately NO authenticated/anonymous INSERT, UPDATE, DELETE or
-- SELECT storage policies; changing content-type cannot bypass server decoding.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('avatars','avatars',false,2097152,array['image/webp']);

create function public.set_my_avatar(p_path text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null or p_path is null or p_path !~ ('^' || auth.uid()::text || '/[a-f0-9-]{36}\.webp$') or
 not exists(select 1 from storage.objects where bucket_id='avatars' and name=p_path) then return false; end if;
 update public.profiles set avatar_path=p_path,updated_at=now() where id=auth.uid();
 return found;
end $$;
revoke all on function public.set_my_avatar(text) from public, anon;
grant execute on function public.set_my_avatar(text) to authenticated;

create function public.visible_avatar(p_id uuid) returns text
language sql stable security definer set search_path = '' as $$
 select avatar_path from public.profiles where id=p_id and
 (id=auth.uid() or (onboarding_completed_at is not null and
 (visibility='public' or (visibility='members' and auth.uid() is not null))));
$$;
revoke all on function public.visible_avatar(uuid) from public;
grant execute on function public.visible_avatar(uuid) to anon, authenticated;

-- 202610220003_active_member_visibility.sql
-- A still-unexpired JWT must not give a deleted/unverified account access to
-- members-only data. App getUser checks are independent of this API boundary.
create function private.is_verified_member() returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from auth.users u join private.account_security s on s.user_id=u.id
 where u.id=auth.uid() and u.email_confirmed_at is not null and u.deleted_at is null
 and (u.banned_until is null or u.banned_until<=now()));
$$;
revoke all on function private.is_verified_member() from public,anon,authenticated;

create or replace function public.visible_profile(p_username text)
returns table(id uuid,username text,display_name text,bio text,visibility text,has_avatar boolean,favorite_games text[],gaming_platforms text[])
language sql stable security definer set search_path = '' as $$
 select p.id,p.username,p.display_name,p.bio,p.visibility,p.avatar_path is not null,
 array(select g.name from public.user_games ug join public.games g on g.id=ug.game_id where ug.user_id=p.id),
 array(select x.name from public.user_platforms up join public.platforms x on x.id=up.platform_id where up.user_id=p.id)
 from public.profiles p where p.username=p_username and p.onboarding_completed_at is not null
 and (p.id=auth.uid() or p.visibility='public' or (p.visibility='members' and private.is_verified_member()));
$$;
create or replace function public.visible_avatar(p_id uuid) returns text
language sql stable security definer set search_path = '' as $$
 select avatar_path from public.profiles where id=p_id and
 (id=auth.uid() or (onboarding_completed_at is not null and
 (visibility='public' or (visibility='members' and private.is_verified_member()))));
$$;

create function private.remove_member_limits() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 delete from private.rate_limits where key='profile:' || old.id::text;
 return old;
end $$;
revoke all on function private.remove_member_limits() from public,anon,authenticated;
create trigger on_auth_user_deleted after delete on auth.users for each row execute function private.remove_member_limits();

create index rate_limits_window_start_idx on private.rate_limits(window_start);
create or replace function public.consume_auth_rate_limit(digest text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
 if digest !~ '^[a-f0-9]{64}$' then return false; end if;
 -- HMAC-only abuse records have bounded retention without storing raw emails.
 delete from private.rate_limits where window_start < now() - interval '24 hours';
 return private.take_limit('auth:' || digest,8,900);
end $$;

-- 202610220004_avatar_policy_boundary.sql
-- Restrictive bucket guards also resist broad permissive policies already
-- present in a shared project (or added later for unrelated storage buckets).
-- The trusted service role still performs validated server-side operations.
create policy avatars_server_only on storage.objects as restrictive
 for all to anon,authenticated
 using (bucket_id <> 'avatars') with check (bucket_id <> 'avatars');
create policy avatar_bucket_server_only on storage.buckets as restrictive
 for all to anon,authenticated
 using (id <> 'avatars') with check (id <> 'avatars');

-- Register the applied versions so later Supabase CLI pushes do not repeat them.
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
 version text PRIMARY KEY, statements text[], name text
);
REVOKE ALL ON SCHEMA supabase_migrations FROM public, anon, authenticated;
REVOKE ALL ON supabase_migrations.schema_migrations FROM public, anon, authenticated;
INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES
 ('202610220001','profiles'),
 ('202610220002','avatars'),
 ('202610220003','active_member_visibility'),
 ('202610220004','avatar_policy_boundary')
ON CONFLICT (version) DO NOTHING;
NOTIFY pgrst, 'reload schema';
COMMIT;
