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
