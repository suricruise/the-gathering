-- Storage is deleted through its API; only the trusted server can schedule/mark cleanup.
create function public.chat_cleanup_files(p_user uuid default null,p_limit integer default 500)
returns table(id uuid,storage_path text)
language sql stable security definer set search_path='' as $$
 select a.id,a.storage_path from public.message_attachments a
 left join public.messages m on m.id=a.message_id
 where a.removed_at is null and
 (case when p_user is not null then a.author_id=p_user
 else (a.message_id is null and a.created_at<now()-interval '24 hours') or m.deleted_at is not null end)
 order by a.created_at,a.id limit least(greatest(p_limit,1),500);
$$;
create function public.chat_files_removed(p_ids uuid[]) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if coalesce(cardinality(p_ids),0)>500 then raise exception 'Batch too large'; end if;
 perform 1 from public.channels where id in(select channel_id from public.message_attachments where id=any(p_ids)) order by id for update;
 update public.message_attachments set removed_at=now() where id=any(p_ids);
 update public.messages set version=version where id in(select message_id from public.message_attachments where id=any(p_ids));
 return true;
end $$;
revoke all on function public.chat_cleanup_files(uuid,integer),public.chat_files_removed(uuid[]) from public,anon,authenticated;
grant execute on function public.chat_cleanup_files(uuid,integer),public.chat_files_removed(uuid[]) to service_role;
