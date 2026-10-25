-- Stage 5 channel threads: additive migration only; recorded reruns skip.
BEGIN;
SELECT pg_advisory_xact_lock(20261030);
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations(version text PRIMARY KEY,statements text[],name text);
REVOKE ALL ON SCHEMA supabase_migrations FROM public,anon,authenticated;
REVOKE ALL ON supabase_migrations.schema_migrations FROM public,anon,authenticated;
DO $preflight$ BEGIN
 IF to_regprocedure('public.set_message_pin(uuid,boolean)') IS NULL THEN RAISE EXCEPTION 'Apply message-interactions-setup.sql first.';END IF;
 IF (to_regprocedure('public.channel_thread_page(uuid,uuid,bigint)') IS NOT NULL OR to_regclass('public.messages_thread_activity') IS NOT NULL OR to_regprocedure('private.thread_participant_notifications()') IS NOT NULL) AND NOT EXISTS(select 1 from supabase_migrations.schema_migrations where version='202611090001') THEN RAISE EXCEPTION 'Thread objects exist without a migration record. Inspect history; do not reset tables.';END IF;
END $preflight$;
DO $install$ BEGIN
 IF NOT EXISTS(select 1 from supabase_migrations.schema_migrations where version='202611090001') THEN
 EXECUTE $migration$
-- Reuse existing messages/parent IDs, authorization and private Broadcast.
create index messages_thread_activity on public.messages(channel_id,parent_id,created_seq desc) include(created_at,author_id)
 where parent_id is not null and deleted_at is null;
create function public.channel_thread_page(p_channel uuid,p_parent uuid,p_before bigint default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare parent public.messages;
begin
 if not coalesce(public.channel_access(p_channel),false) then raise exception 'Thread unavailable' using errcode='42501';end if;
 select * into parent from public.messages where id=p_parent and channel_id=p_channel and parent_id is null;
 if not found then raise exception 'Thread unavailable' using errcode='42501';end if;
 if p_before is not null and p_before<0 then raise exception 'Invalid cursor' using errcode='22023';end if;
 return public.chat_page(p_channel,p_parent,p_before,null)||jsonb_build_object('root',private.chat_message_dto(parent));
end$$;
create function private.thread_participant_notifications() returns trigger
language plpgsql security definer set search_path='' as $$
declare recipient uuid;direct_recipient uuid;
begin
 if new.parent_id is null then return new;end if;
 select author_id into direct_recipient from public.messages where id=coalesce(new.reply_to_id,new.parent_id) and deleted_at is null;
 -- Existing direct reply and mention triggers stay intact. No double direct notification.
 for recipient in
  select distinct author_id from public.messages
  where channel_id=new.channel_id and (id=new.parent_id or parent_id=new.parent_id)
   and deleted_at is null and author_id is not null and author_id is distinct from new.author_id
   and author_id is distinct from direct_recipient
 loop
  -- Rechecks current channel access, account eligibility, mutual blocks and replies opt-out.
  perform private.emit_notification(recipient,new.author_id,'replies','channel',new.id,'thread-reply:'||new.id::text||':'||recipient::text);
 end loop;
 return new;
end$$;
create trigger thread_participant_notifications after insert on public.messages for each row execute function private.thread_participant_notifications();
revoke all on function public.channel_thread_page(uuid,uuid,bigint),private.thread_participant_notifications() from public,anon,authenticated;
grant execute on function public.channel_thread_page(uuid,uuid,bigint) to authenticated;

create or replace function private.chat_message_dto(m public.messages) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',m.id,'channel_id',m.channel_id,'author_id',m.author_id,
 'author_name',coalesce(nullif(p.display_name,''),p.username,'Former member'),'author_avatar',coalesce(public.visible_avatar(m.author_id) is not null,false),
 'pinned_at',m.pinned_at,'parent_id',m.parent_id,'reply_to_id',m.reply_to_id,'body',m.body,'created_at',m.created_at,'edited_at',m.edited_at,'deleted_at',m.deleted_at,
 'created_seq',m.created_seq::text,'version',m.version::text,
 'thread_latest_at',(select created_at from public.messages where channel_id=m.channel_id and parent_id=m.id and deleted_at is null order by created_seq desc limit 1),
 'reply_count',(select count(*) from public.messages where parent_id=m.id and deleted_at is null),
 'read_count',(select count(*) from public.read_receipts r where r.channel_id=m.channel_id and r.user_id is distinct from m.author_id and r.last_read_seq>=m.created_seq),
 'reactions',coalesce((select jsonb_agg(x) from (select emoji,count(*)::integer as count,bool_or(user_id=auth.uid()) as mine from public.message_reactions where message_id=m.id group by emoji order by emoji) x),'[]'),
 'attachments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'filename',a.filename,'mime',a.mime,'kind',a.kind,'byte_size',a.byte_size) order by a.created_at,a.id) from public.message_attachments a where a.message_id=m.id and a.removed_at is null and m.deleted_at is null),'[]'),
 'previews',coalesce((select jsonb_agg(jsonb_build_object('url',l.url,'title',l.title,'description',l.description,'hostname',l.hostname)) from public.message_link_previews l where l.message_id=m.id and m.deleted_at is null),'[]'))
 from (values(1)) dummy(n) left join public.profiles p on p.id=m.author_id;
$$;


notify pgrst,'reload schema';
$migration$;
 INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES('202611090001','channel_threads');
 END IF;
END $install$;
COMMIT;
