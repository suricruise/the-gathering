-- Run only this pending additive Phase 6 update. Recorded reruns safely skip.
BEGIN;
SELECT pg_advisory_xact_lock(20261030);
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations(version text PRIMARY KEY,statements text[],name text);
REVOKE ALL ON SCHEMA supabase_migrations FROM public,anon,authenticated;
REVOKE ALL ON supabase_migrations.schema_migrations FROM public,anon,authenticated;
DO $install$ BEGIN
 IF NOT EXISTS(select 1 from supabase_migrations.schema_migrations where version='202611160001') THEN
 IF to_regprocedure('public.lounge_profile(text)') IS NOT NULL OR EXISTS(select 1 from information_schema.columns where table_schema='public' and table_name='user_preferences' and column_name='share_profile_interests') THEN RAISE EXCEPTION 'Profile objects exist without migration history. Inspect history; do not reset.';END IF;
 EXECUTE $migration$
-- Additive interests; no historical selections or privacy choices are reset.
alter table public.user_preferences add column share_profile_interests boolean not null default false;
alter table public.user_preferences drop constraint user_preferences_interests_check;
alter table public.user_preferences add constraint user_preferences_interests_check check(cardinality(interests)<=16 and interests <@ array['gaming','movies-tv','music','books-comics','technology','sports','food','outdoors','casual','competitive','co-op','creative','faith','conversation','events','streaming']::text[]);
create or replace function public.save_my_profile(
 p_username text, p_display_name text, p_bio text, p_visibility text,
 p_interests text[], p_games text[], p_platforms text[], p_complete boolean default false
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid();
begin
 if not private.is_verified_member() or caller is null or not exists(select 1 from private.account_security where user_id=caller) or
 not exists(select 1 from auth.users where id=caller and email_confirmed_at is not null) then return false; end if;
 -- Return failures instead of throwing so failed unique checks still consume
 -- a rate-limit attempt. There is no user lookup/availability RPC.
 if not private.take_limit('profile:' || caller::text, 12, 900) then return false; end if;
 if p_username is null or p_username !~ '^[a-z][a-z0-9_]{2,23}$' or
 p_username in ('admin','administrator','support','moderator','the_gathering','api','auth','settings','deleted') or
 p_display_name is null or char_length(trim(p_display_name)) not between 1 and 60 or
 p_bio is null or char_length(p_bio)>500 or p_visibility is null or p_visibility not in ('private','members','public') or
 p_interests is null or cardinality(p_interests)>16 or not (p_interests <@ array['gaming','movies-tv','music','books-comics','technology','sports','food','outdoors','casual','competitive','co-op','creative','faith','conversation','events','streaming']::text[]) or
 array_position(p_interests,null) is not null or
 p_games is null or cardinality(p_games)>12 or array_position(p_games,null) is not null or
 p_platforms is null or cardinality(p_platforms)>5 or array_position(p_platforms,null) is not null or
 exists(select 1 from unnest(p_games) g where not exists(select 1 from public.games where id=g)) or
 exists(select 1 from unnest(p_platforms) p where not exists(select 1 from public.platforms where id=p)) or
 (p_complete and cardinality(p_interests)<1) then return false; end if;
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


create function public.save_lounge_profile(p_username text,p_display_name text,p_bio text,p_visibility text,p_interests text[],p_games text[],p_platforms text[],p_complete boolean,p_share_interests boolean) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_share_interests is null then return false;end if;
 if not public.save_my_profile(p_username,p_display_name,p_bio,p_visibility,p_interests,p_games,p_platforms,p_complete) then return false;end if;
 update public.user_preferences set share_profile_interests=p_share_interests where user_id=auth.uid();return true;
end$$;
revoke all on function public.save_lounge_profile(text,text,text,text,text[],text[],text[],boolean,boolean) from public,anon;
grant execute on function public.save_lounge_profile(text,text,text,text,text[],text[],text[],boolean,boolean) to authenticated;

create function public.lounge_profile(p_username text) returns jsonb language plpgsql security definer set search_path='' as $$
declare target uuid; result jsonb;begin
 if not private.squad_live(auth.uid()) then raise exception 'Unavailable' using errcode='42501';end if;
 if not public.people_budget('search') then return jsonb_build_object('limited',true);end if;
 select id into target from public.visible_profile(p_username);
 if target is null or not private.squad_live(target) then return null;end if;
 select jsonb_build_object('interests',case when u.share_profile_interests or target=auth.uid() then to_jsonb(u.interests) else '[]'::jsonb end,
 'communities',coalesce((select jsonb_agg(to_jsonb(q)) from (
 select c.id,c.slug,c.name,exists(select 1 from public.community_members m where m.community_id=c.id and m.user_id=auth.uid() and m.status='active') mutual
 from public.communities c join public.community_members m on m.community_id=c.id and m.user_id=target and m.status='active'
 where not c.archived and public.community_access(c.id) and (c.visibility='public' or exists(select 1 from public.community_members n where n.community_id=c.id and n.user_id=auth.uid() and n.status='active'))
 order by c.display_order,c.name,c.id limit 30)q),'[]'::jsonb)) into result from public.user_preferences u where u.user_id=target;
 return result;
end$$;
revoke all on function public.lounge_profile(text) from public,anon;
grant execute on function public.lounge_profile(text) to authenticated;

create function public.lounge_people() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;actor uuid:=auth.uid();begin
 if not private.squad_live(actor) then raise exception 'Unavailable' using errcode='42501';end if;
 if not public.people_budget('search') then return jsonb_build_object('limited',true);end if;
 select coalesce(jsonb_agg(q.card order by q.score desc,q.username),'[]') into result from (
 select p.username,private.people_card(actor,p.id) card,
 (select count(*) from (select unnest(x.interests) intersect select unnest(y.interests))i)
 +case when private.shared_member_community(actor,p.id) is not null then 2 else 0 end
 +case when private.people_friends(actor,p.id) then 1 else 0 end score
 from public.profiles p join public.user_preferences y on y.user_id=p.id join public.user_preferences x on x.user_id=actor
 where p.id<>actor and private.people_visible(actor,p.id) and (x.interests && y.interests or private.shared_member_community(actor,p.id) is not null or private.people_friends(actor,p.id))
 order by score desc,p.username limit 12)q;
 return jsonb_build_object('items',result);
end$$;
revoke all on function public.lounge_people() from public,anon;
grant execute on function public.lounge_people() to authenticated;
notify pgrst,'reload schema';

$migration$;
 INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES('202611160001','lounge_profiles');
 END IF;
END $install$;
COMMIT;
