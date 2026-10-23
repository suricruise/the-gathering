-- Claim files before Storage deletion so an expired staged file cannot be attached
-- concurrently. Missing metadata after a deleted community is also cleaned up.
create or replace function public.chat_cleanup_files(p_user uuid default null,p_limit integer default 500)
returns table(id uuid,storage_path text)
language plpgsql security definer set search_path='' as $$
declare selected uuid[];
begin
 -- Match the channel lock order used by sends, edits, and account cleanup.
 perform 1 from public.channels where public.channels.id in (
  select a.channel_id from public.message_attachments a left join public.messages m on m.id=a.message_id
  where case when p_user is not null then a.author_id=p_user
  else (a.message_id is null and a.created_at<now()-interval '24 hours') or m.deleted_at is not null end
 ) order by public.channels.id for update;
 select array_agg(x.id) into selected from (
  select a.id from public.message_attachments a join storage.objects o on o.bucket_id='message-files' and o.name=a.storage_path
  left join public.messages m on m.id=a.message_id
  where case when p_user is not null then a.author_id=p_user
  else (a.message_id is null and a.created_at<now()-interval '24 hours') or m.deleted_at is not null end
  order by a.created_at,a.id limit least(greatest(p_limit,1),500) for update of a skip locked
 ) x;
 update public.message_attachments a set removed_at=coalesce(a.removed_at,now()) where a.id=any(selected);
 return query
 select a.id,a.storage_path from public.message_attachments a where a.id=any(selected)
 union all
 select o.id,o.name from storage.objects o where o.bucket_id='message-files'
 and not exists(select 1 from public.message_attachments a where a.storage_path=o.name)
 and (case when p_user is not null then split_part(o.name,'/',2)=p_user::text else o.created_at<now()-interval '24 hours' end)
 limit least(greatest(p_limit,1),500);
end $$;
