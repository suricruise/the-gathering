-- Premium lounge new-member read only; recorded reruns skip safely.
BEGIN;
SELECT pg_advisory_xact_lock(20261030);
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations(version text PRIMARY KEY,statements text[],name text);
REVOKE ALL ON SCHEMA supabase_migrations FROM public,anon,authenticated;
REVOKE ALL ON supabase_migrations.schema_migrations FROM public,anon,authenticated;
DO $preflight$ BEGIN
 IF to_regprocedure('public.channel_management(uuid,text,jsonb)') IS NULL THEN RAISE EXCEPTION 'Install Stage 8 channel management before the premium lounge read projection.';END IF;
 IF to_regprocedure('public.lounge_new_members()') IS NOT NULL AND NOT EXISTS(select 1 from supabase_migrations.schema_migrations where version='202611130001') THEN RAISE EXCEPTION 'Lounge objects exist without a migration record. Inspect history; do not reset.';END IF;
END $preflight$;
DO $install$ BEGIN
 IF NOT EXISTS(select 1 from supabase_migrations.schema_migrations where version='202611130001') THEN
 EXECUTE $migration$
-- Premium lounge: minimal authorized new-member projection. No data/schema resets.
create function public.lounge_new_members() returns jsonb language plpgsql security definer set search_path='' as $$begin
 if not private.squad_live(auth.uid()) then raise exception 'Not authorized' using errcode='42501';end if;
 if not private.take_limit('lounge-new-members:'||auth.uid()::text,30,900) then return jsonb_build_object('limited',true);end if;
 return jsonb_build_object('items',coalesce((select jsonb_agg(x.card order by x.created_at desc,x.id) from (
  select p.id,p.created_at,private.people_card(auth.uid(),p.id) card from public.profiles p
  where p.id<>auth.uid() and p.created_at>=now()-interval '7 days' and private.people_visible(auth.uid(),p.id)
  order by p.created_at desc,p.id limit 5)x),'[]'::jsonb));
end$$;
revoke all on function public.lounge_new_members() from public,anon,authenticated;
grant execute on function public.lounge_new_members() to authenticated;
notify pgrst,'reload schema';
$migration$;
 INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES('202611130001','lounge_new_members');
 END IF;
END $install$;
COMMIT;
