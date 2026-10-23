-- Private bucket. Only the trusted upload server may write transformed images.
-- There are deliberately NO authenticated/anonymous INSERT, UPDATE, DELETE or
-- SELECT storage policies; changing content-type cannot bypass server decoding.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('avatars','avatars',false,2097152,array['image/webp']);

create function public.set_my_avatar(p_path text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null or p_path is null or p_path !~ ('^' || auth.uid()::text || '/[a-f0-9-]{36}\.webp$') or
 not exists(select 1 from storage.objects where bucket_id='avatars' and name=p_path) then return false; end if;
 update public.profiles set avatar_path=p_path,updated_at=now() where id=auth.uid();
 return found;
end $$;
revoke all on function public.set_my_avatar(text) from public, anon;
grant execute on function public.set_my_avatar(text) to authenticated;

create function public.visible_avatar(p_id uuid) returns text
language sql stable security definer set search_path = '' as $$
 select avatar_path from public.profiles where id=p_id and
 (id=auth.uid() or (onboarding_completed_at is not null and
 (visibility='public' or (visibility='members' and auth.uid() is not null))));
$$;
revoke all on function public.visible_avatar(uuid) from public;
grant execute on function public.visible_avatar(uuid) to anon, authenticated;
