-- Backfill any accounts created while the initial privacy trigger was being installed.
insert into public.member_privacy(user_id) select id from auth.users on conflict do nothing;
-- Friends-only squads now use accepted friendships, rather than reciprocal social follows.
create or replace function private.squad_eligible(p_user uuid,s public.gaming_sessions) returns boolean language sql stable security definer set search_path='' as $$
 select private.squad_live(p_user) and private.squad_live(s.host_id)
 and (s.community_id is null or exists(select 1 from public.community_members m join public.community_roles r on r.id=m.role_id where m.community_id=s.community_id and m.user_id=s.host_id and m.status='active' and (not s.game_night or r.rank>=20)))
 and (p_user=s.host_id or (not private.squad_blocked(p_user,s.host_id) and case s.visibility
 when 'public' then true when 'friends' then private.people_friends(p_user,s.host_id)
 else exists(select 1 from public.community_members where community_id=s.community_id and user_id=p_user and status='active') end));
$$;
notify pgrst,'reload schema';
