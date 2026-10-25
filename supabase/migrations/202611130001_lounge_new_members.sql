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
