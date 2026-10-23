-- Every update (including account cleanup and server preview updates) participates
-- in the same channel revision lock, so reconnect cursors cannot skip late commits.
create or replace function private.chat_message_changed() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.channels where id=new.channel_id for update;
 new.version:=nextval('private.message_revision');
 return new;
end $$;
create or replace function private.chat_account_deleted() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.channels where id in(select channel_id from public.messages where author_id=old.id) order by id for update;
 update public.messages set body='',deleted_at=coalesce(deleted_at,clock_timestamp()) where author_id=old.id;
 delete from public.message_link_previews where message_id in(select id from public.messages where author_id=old.id);
 return old;
end $$;
