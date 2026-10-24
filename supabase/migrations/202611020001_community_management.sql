-- Permanent deletion and shared display ordering. Existing client table writes remain denied.
alter table public.communities add column display_order integer not null default 1000 check(display_order between 0 and 999999);
create index communities_display_order on public.communities(display_order,name,id);
create function public.community_directory() returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if not private.is_verified_member() then raise exception 'Not authorized' using errcode='42501';end if;
 return coalesce((select jsonb_agg(x order by x.display_order,x.name,x.id) from (
 select c.id,c.slug,c.name,c.description,c.visibility,c.cover,c.display_order,
 case when h.version is null then null else jsonb_build_object('version',h.version) end community_headers
 from public.communities c left join public.community_headers h on h.community_id=c.id
 where public.community_access(c.id) order by c.display_order,c.name,c.id limit 200)x),'[]');
end$$;
create function public.community_manage(p_operation text,p_community uuid,p_reason text,p_position integer default null,p_confirmation text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();pr integer;cr integer;c public.communities;begin
 perform pg_advisory_xact_lock(20261030);
 pr:=private.platform_rank();cr:=private.admin_community_rank(p_community);
 if not private.is_verified_member() or p_reason is null or length(btrim(p_reason)) not between 5 and 500 then raise exception 'Not authorized' using errcode='42501';end if;
 if p_operation='community_order' then
  if pr<30 then raise exception 'Not authorized' using errcode='42501';end if;
 elsif p_operation='community_delete' then
  if pr<30 and cr<>40 then raise exception 'Not authorized' using errcode='42501';end if;
 else raise exception 'Invalid operation' using errcode='22023';end if;
 if not private.take_limit('community-manage:'||actor::text,60,900) then raise exception 'Rate limited' using errcode='42501';end if;
 select * into c from public.communities where id=p_community for update;
 if not found then raise exception 'Community unavailable' using errcode='42501';end if;
 if p_operation='community_order' then
  if p_position is null or p_position not between 0 and 999999 or p_confirmation is not null then raise exception 'Invalid position' using errcode='22023';end if;
  update public.communities set display_order=p_position where id=c.id;
  insert into private.admin_audit(actor_id,community_id,target_id,action,reason) values(actor,c.id,c.id,p_operation,btrim(p_reason));
  insert into public.community_audit_log(community_id,actor_id,action,detail) values(c.id,actor,p_operation,jsonb_build_object('previous',c.display_order,'position',p_position));
 else
  if p_confirmation is distinct from c.slug or p_position is not null then raise exception 'Type the exact community address to confirm deletion' using errcode='22023';end if;
  -- The target UUID survives; scope becomes NULL so only platform staff retain access.
  insert into private.admin_audit(actor_id,target_id,action,reason) values(actor,c.id,p_operation,btrim(p_reason));
  insert into public.community_audit_log(actor_id,action,detail) values(actor,p_operation,jsonb_build_object('community_id',c.id,'slug',c.slug));
  delete from public.communities where id=c.id;
 end if;
 return jsonb_build_object('ok',true,'id',c.id);
end$$;
revoke all on function public.community_directory(),public.community_manage(text,uuid,text,integer,text) from public,anon,authenticated;
grant execute on function public.community_directory(),public.community_manage(text,uuid,text,integer,text) to authenticated;
notify pgrst,'reload schema';
