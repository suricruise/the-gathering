-- Stage 4 message interactions: additive migration only; recorded reruns skip.
BEGIN;
SELECT pg_advisory_xact_lock(20261030);
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations(version text PRIMARY KEY,statements text[],name text);
REVOKE ALL ON SCHEMA supabase_migrations FROM public,anon,authenticated;
REVOKE ALL ON supabase_migrations.schema_migrations FROM public,anon,authenticated;
DO $preflight$ BEGIN
 IF to_regprocedure('public.channel_workspace_members(uuid,uuid)') IS NULL THEN RAISE EXCEPTION 'Apply channel-workspace-setup.sql first.';END IF;
 IF (EXISTS(select 1 from information_schema.columns where table_schema='public' and table_name='messages' and column_name='pinned_at') OR to_regprocedure('public.set_message_pin(uuid,boolean)') IS NOT NULL) AND NOT EXISTS(select 1 from supabase_migrations.schema_migrations where version='202611080001') THEN RAISE EXCEPTION 'Interaction objects exist without a migration record. Inspect history; do not reset tables.';END IF;
END $preflight$;
DO $install$ BEGIN
 IF NOT EXISTS(select 1 from supabase_migrations.schema_migrations where version='202611080001') THEN
 EXECUTE $migration$
-- Additive pin state on existing messages. Preserve IDs, RLS, tombstones and transport.
alter table public.messages add column pinned_at timestamptz;
create index messages_pinned on public.messages(channel_id,pinned_at desc,id) where pinned_at is not null and deleted_at is null;

create function private.chat_interaction_metadata() returns trigger
language plpgsql security definer set search_path='' as $$begin
 if new.deleted_at is not null then new.pinned_at:=null; end if;
 -- Existing edit timestamps remain authoritative; retain only limited audit metadata.
 if new.body is distinct from old.body and new.deleted_at is null and new.edited_at is distinct from old.edited_at then
  insert into private.message_moderation(message_id,actor_id,action) values(old.id,auth.uid(),'author_edit');
 end if;
 return new;
end$$;
create trigger chat_interaction_metadata before update on public.messages for each row execute function private.chat_interaction_metadata();

create or replace function private.chat_message_dto(m public.messages) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',m.id,'channel_id',m.channel_id,'author_id',m.author_id,
 'author_name',coalesce(nullif(p.display_name,''),p.username,'Former member'),'author_avatar',coalesce(public.visible_avatar(m.author_id) is not null,false),
 'pinned_at',m.pinned_at,'parent_id',m.parent_id,'reply_to_id',m.reply_to_id,'body',m.body,'created_at',m.created_at,'edited_at',m.edited_at,'deleted_at',m.deleted_at,
 'created_seq',m.created_seq::text,'version',m.version::text,
 'reply_count',(select count(*) from public.messages where parent_id=m.id and deleted_at is null),
 'read_count',(select count(*) from public.read_receipts r where r.channel_id=m.channel_id and r.user_id is distinct from m.author_id and r.last_read_seq>=m.created_seq),
 'reactions',coalesce((select jsonb_agg(x) from (select emoji,count(*)::integer as count,bool_or(user_id=auth.uid()) as mine from public.message_reactions where message_id=m.id group by emoji order by emoji) x),'[]'),
 'attachments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'filename',a.filename,'mime',a.mime,'kind',a.kind,'byte_size',a.byte_size) order by a.created_at,a.id) from public.message_attachments a where a.message_id=m.id and a.removed_at is null and m.deleted_at is null),'[]'),
 'previews',coalesce((select jsonb_agg(jsonb_build_object('url',l.url,'title',l.title,'description',l.description,'hostname',l.hostname)) from public.message_link_previews l where l.message_id=m.id and m.deleted_at is null),'[]'))
 from (values(1)) dummy(n) left join public.profiles p on p.id=m.author_id;
$$;

create function public.set_message_pin(p_message uuid,p_active boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m public.messages; rank integer;
begin
 select * into m from public.messages where id=p_message;
 if not found then raise exception 'Message unavailable' using errcode='42501';end if;
 perform private.chat_require(m.channel_id,'view');
 select private.community_rank(community_id) into rank from public.channels where id=m.channel_id;
 if coalesce(rank,0)<20 then raise exception 'Not authorized' using errcode='42501';end if;
 select * into m from public.messages where id=p_message for update;
 if p_active is null or m.deleted_at is not null then raise exception 'Message unavailable' using errcode='22023';end if;
 if not private.take_limit('chat-pin:'||auth.uid()::text,30,60) then raise exception 'Please try later' using errcode='P0001';end if;
 if (m.pinned_at is not null)=p_active then return public.chat_message(p_message);end if;
 if p_active and (select count(*) from public.messages where channel_id=m.channel_id and pinned_at is not null and deleted_at is null)>=50 then raise exception 'Pin limit reached' using errcode='22023';end if;
 update public.messages set pinned_at=case when p_active then clock_timestamp() else null end where id=p_message;
 insert into private.message_moderation(message_id,actor_id,action) values(p_message,auth.uid(),case when p_active then 'pin' else 'unpin' end);
 return public.chat_message(p_message);
end$$;
create function public.channel_pinned_messages(p_channel uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$begin
 if not coalesce(public.channel_access(p_channel),false) or not exists(select 1 from public.channels where id=p_channel and kind='text') then raise exception 'Channel unavailable' using errcode='42501';end if;
 return coalesce((select jsonb_agg(private.chat_message_dto(m) order by m.pinned_at desc,m.id) from public.messages m where m.channel_id=p_channel and m.pinned_at is not null and m.deleted_at is null),'[]'::jsonb);
end$$;
revoke all on function private.chat_interaction_metadata(),public.set_message_pin(uuid,boolean),public.channel_pinned_messages(uuid) from public,anon,authenticated;
grant execute on function public.set_message_pin(uuid,boolean),public.channel_pinned_messages(uuid) to authenticated;

notify pgrst,'reload schema';
$migration$;
 INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES('202611080001','message_interactions');
 END IF;
END $install$;
COMMIT;
