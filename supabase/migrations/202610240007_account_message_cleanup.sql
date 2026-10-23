-- Process replies individually before roots; an AFTER trigger also revises the
-- root, so a single UPDATE over both can otherwise revisit the same tuple.
create or replace function private.chat_account_deleted() returns trigger
language plpgsql security definer set search_path='' as $$
declare m record;
begin
 perform 1 from public.channels where id in(select channel_id from public.messages where author_id=old.id) order by id for update;
 for m in select id from public.messages where author_id=old.id order by created_seq desc loop
  update public.messages set body='',deleted_at=coalesce(deleted_at,clock_timestamp()) where id=m.id;
 end loop;
 delete from public.message_link_previews where message_id in(select id from public.messages where author_id=old.id);
 return old;
end $$;
notify pgrst,'reload schema';
