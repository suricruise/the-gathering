-- Explicit boolean policy projection; raw private ACL functions remain revoked.
create function private.friendship_readable(a uuid,b uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() in (a,b) and private.squad_live(auth.uid()) and private.squad_live(a) and private.squad_live(b) and not private.squad_blocked(a,b);
$$;
revoke all on function private.friendship_readable(uuid,uuid) from public,anon;
grant execute on function private.friendship_readable(uuid,uuid) to authenticated;
alter policy friendship_own on public.friendships using(private.friendship_readable(low_id,high_id));
alter policy notification_own on public.member_notifications using(private.friendship_readable(user_id,actor_id) and user_id=auth.uid());
-- Authenticated blocks also apply to profile/portrait discovery, including direct URLs.
alter function public.visible_profile(text) rename to people_legacy_visible_profile;
alter function public.visible_avatar(uuid) rename to people_legacy_visible_avatar;
revoke all on function public.people_legacy_visible_profile(text),public.people_legacy_visible_avatar(uuid) from public,anon,authenticated;
create function public.visible_profile(p_username text)
returns table(id uuid,username text,display_name text,bio text,visibility text,has_avatar boolean,favorite_games text[],gaming_platforms text[])
language sql stable security definer set search_path='' as $$
 select p.* from public.people_legacy_visible_profile(p_username) p where auth.uid() is null or p.id=auth.uid() or not private.squad_blocked(auth.uid(),p.id);
$$;
create function public.visible_avatar(p_id uuid) returns text language sql stable security definer set search_path='' as $$
 select public.people_legacy_visible_avatar(p_id) where auth.uid() is null or p_id=auth.uid() or not private.squad_blocked(auth.uid(),p_id);
$$;
revoke all on function public.visible_profile(text),public.visible_avatar(uuid) from public;
grant execute on function public.visible_profile(text),public.visible_avatar(uuid) to anon,authenticated;
