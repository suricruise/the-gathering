-- Premium Home/Explore only. Recorded reruns skip; never replay earlier phase setup.
BEGIN;
SELECT pg_advisory_xact_lock(20261030);
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations(version text PRIMARY KEY,statements text[],name text);
REVOKE ALL ON SCHEMA supabase_migrations FROM public,anon,authenticated;
REVOKE ALL ON supabase_migrations.schema_migrations FROM public,anon,authenticated;
DO $preflight$ BEGIN
 IF to_regprocedure('public.lounge_new_members()') IS NULL THEN RAISE EXCEPTION 'Install Premium Lounge Phase 2 before Home/Explore.';END IF;
 IF (to_regprocedure('public.community_discovery()') IS NOT NULL OR to_regprocedure('public.community_interest_set(uuid,text)') IS NOT NULL OR EXISTS(select 1 from information_schema.columns where table_schema='public' and table_name='communities' and column_name='interest_category')) AND NOT EXISTS(select 1 from supabase_migrations.schema_migrations where version='202611140001') THEN RAISE EXCEPTION 'Discovery objects exist without a migration record. Inspect history; do not reset.';END IF;
END $preflight$;
DO $install$ BEGIN
 IF NOT EXISTS(select 1 from supabase_migrations.schema_migrations where version='202611140001') THEN
 EXECUTE $migration$
-- Optional host-selected taxonomy; existing communities remain uncategorized.
alter table public.communities add column interest_category text check(interest_category in ('conversation','gaming','movies-tv','music','books-comics','creativity','technology','sports','faith-life','lifestyle'));
create index messages_discovery_recent on public.messages(channel_id,created_at desc) where deleted_at is null;
create index posts_discovery_recent on public.posts(community_id,created_at desc);
create function public.community_discovery() returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();result jsonb;conversations jsonb;recent jsonb;begin
 if not private.squad_live(actor) then raise exception 'Not authorized' using errcode='42501';end if;
 if not private.take_limit('discovery-read:'||actor::text,120,900) then return jsonb_build_object('limited',true);end if;
 with visible as materialized (
 select c.* from public.communities c where public.community_access(c.id) order by c.display_order,c.name,c.id limit 200
 ), cards as (
 select c.id,c.interest_category category,c.created_at,
 (select count(*) from public.community_members m where m.community_id=c.id and m.status='active' and private.squad_live(m.user_id) and not private.squad_blocked(actor,m.user_id)) members,
 case when private.community_rank(c.id)>0 then (select count(*) from public.community_members m where m.community_id=c.id and m.status='active' and private.squad_live(m.user_id) and not private.squad_blocked(actor,m.user_id) and (private.people_card(actor,m.user_id)->>'online')::boolean is true) else null end online,
 (select count(*) from (select m.id from public.messages m join public.channels ch on ch.id=m.channel_id where ch.community_id=c.id and public.channel_access(ch.id) and m.deleted_at is null and m.created_at>now()-interval '7 days' and private.squad_live(m.author_id) and not private.squad_blocked(actor,m.author_id) limit 500)q)
 +(select count(*) from (select p.id from public.posts p where p.community_id=c.id and p.created_at>now()-interval '7 days' and p.status='published' and public.post_access(p.id) and private.squad_live(p.author_id) and not private.squad_blocked(actor,p.author_id) limit 500)q) activity,
 case when private.community_rank(c.id)>0 then exists(select 1 from public.channel_unread_counts(c.id) u where u.unread_count>0) else null end unread
 from visible c)
 select coalesce(jsonb_agg(to_jsonb(cards)),'[]') into result from cards;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into conversations from (
 select ch.id,ch.name,ch.community_id,max(m.created_at) last_at from public.channels ch join public.messages m on m.channel_id=ch.id
 where ch.kind='text' and public.channel_access(ch.id) and m.deleted_at is null and m.created_at>now()-interval '15 minutes' and private.squad_live(m.author_id) and not private.squad_blocked(actor,m.author_id)
 group by ch.id order by max(m.created_at) desc,ch.id limit 4)x;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into recent from (
 select p.id,left(p.body,140) body,p.community_id,p.created_at from public.posts p
 where p.community_id is not null and p.status='published' and p.created_at>now()-interval '7 days' and public.post_access(p.id) and private.squad_live(p.author_id) and not private.squad_blocked(actor,p.author_id)
 order by p.created_at desc,p.id limit 4)x;
 return jsonb_build_object('items',result,'conversations',conversations,'recent',recent,'as_of',now());
end$$;
create function public.community_interest_set(p_community uuid,p_category text) returns boolean language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();begin
 perform pg_advisory_xact_lock(20261030);
 if not private.squad_live(actor) or (private.platform_rank()<30 and private.admin_community_rank(p_community)<30) then raise exception 'Not authorized' using errcode='42501';end if;
 if p_category is not null and p_category not in ('conversation','gaming','movies-tv','music','books-comics','creativity','technology','sports','faith-life','lifestyle') then raise exception 'Invalid category' using errcode='22023';end if;
 if not private.take_limit('community-interest:'||actor::text,30,900) then raise exception 'Rate limited' using errcode='42501';end if;
 perform 1 from public.communities where id=p_community and not archived for update;
 if not found then raise exception 'Community unavailable' using errcode='42501';end if;
 update public.communities set interest_category=p_category where id=p_community;
 insert into public.community_audit_log(community_id,actor_id,action,detail) values(p_community,actor,'community_interest',jsonb_build_object('category',p_category));
 insert into private.admin_audit(actor_id,community_id,target_id,action,reason) values(actor,p_community,p_community,'community_interest','Updated discovery category');
 return true;
end$$;
revoke all on function public.community_discovery(),public.community_interest_set(uuid,text) from public,anon,authenticated;
grant execute on function public.community_discovery(),public.community_interest_set(uuid,text) to authenticated;
notify pgrst,'reload schema';
$migration$;
 INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES('202611140001','discovery');
 END IF;
END $install$;
COMMIT;
