-- Avoid ambiguity between the cleanup loop record and the reservation subquery.
create or replace function public.squad_cleanup(p_limit integer default 500) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.gaming_sessions; cfg private.squad_config; expired_n integer:=0; deleted_n integer:=0;
begin
 select * into cfg from private.squad_config where id;
 for s in select g.* from public.gaming_sessions g where (g.status='open' and (g.expires_at<=clock_timestamp() or not private.squad_eligible(g.host_id,g) or exists(select 1 from public.gaming_session_members m where m.session_id=g.id and m.status in ('accepted','pending') and not private.squad_eligible(m.user_id,g)))) or coalesce(g.ended_at,g.expires_at)<clock_timestamp()-make_interval(days=>cfg.retention_days) order by g.expires_at,g.id limit least(greatest(p_limit,1),500) for update skip locked loop
  if s.status='open' and (s.expires_at<=clock_timestamp() or not private.squad_eligible(s.host_id,s)) then update public.gaming_sessions set status='expired',ended_at=clock_timestamp() where id=s.id;delete from private.squad_voice_sessions where session_id=s.id;expired_n:=expired_n+1;end if;
  update public.gaming_session_members set status='removed',updated_at=clock_timestamp() where session_id=s.id and user_id<>s.host_id and status in ('accepted','pending') and not private.squad_eligible(user_id,s);
  if coalesce(s.ended_at,s.expires_at)<clock_timestamp()-make_interval(days=>cfg.retention_days) then delete from public.gaming_sessions where id=s.id;deleted_n:=deleted_n+1;end if;
 end loop;
 delete from private.squad_voice_sessions v where v.expires_at<=clock_timestamp() or not exists(select 1 from public.gaming_sessions live_group where live_group.id=v.session_id and private.squad_voice_allowed(v.user_id,live_group));
 delete from private.squad_audit where created_at<clock_timestamp()-make_interval(days=>cfg.retention_days);
 delete from private.squad_budgets where minute<clock_timestamp()-interval '1 day';
 return jsonb_build_object('expired',expired_n,'deleted',deleted_n);
end $$;

notify pgrst,'reload schema';
