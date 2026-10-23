-- Separate HTTP admission budgets commit even when a later authorization or
-- external LiveKit operation fails. RPC callers cannot mint provider tokens.
create table private.voice_http_budget (
 user_id uuid not null references auth.users(id) on delete cascade,
 operation text not null check(operation in ('token','control','session','leave')),
 minute timestamptz not null,
 attempts integer not null,
 primary key(user_id,operation,minute)
);
alter table private.voice_http_budget enable row level security;
revoke all on private.voice_http_budget from public,anon,authenticated;
create function public.voice_request_budget(p_operation text) returns boolean
language plpgsql security definer set search_path='' as $$
declare n integer; maximum integer;
begin
 if not private.is_verified_member() or p_operation not in ('token','control','session','leave') then return false; end if;
 maximum:=case when p_operation='token' then 10 when p_operation='control' then 20 else 60 end;
 insert into private.voice_http_budget values(auth.uid(),p_operation,date_trunc('minute',now()),1)
 on conflict(user_id,operation,minute) do update set attempts=private.voice_http_budget.attempts+1 returning attempts into n;
 delete from private.voice_http_budget where minute<now()-interval '1 day';
 return n<=maximum;
end $$;
revoke all on function public.voice_request_budget(text) from public,anon,authenticated;
grant execute on function public.voice_request_budget(text) to authenticated;
NOTIFY pgrst, 'reload schema';
