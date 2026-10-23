-- Persistent messages + transactional, ID-only private Broadcast invalidations.
-- Requires the platform's real Realtime schema. Do not ALTER realtime ownership/RLS.
alter table public.channels add column realtime_epoch uuid not null default gen_random_uuid();
create sequence private.message_revision;
revoke all on sequence private.message_revision from public,anon,authenticated;
create table public.messages (
 id uuid primary key,
 channel_id uuid not null references public.channels(id) on delete cascade,
 author_id uuid references auth.users(id) on delete set null,
 parent_id uuid,
 reply_to_id uuid,
 body text not null default '' check(char_length(body)<=4000),
 created_at timestamptz not null default clock_timestamp(),
 edited_at timestamptz,
 deleted_at timestamptz,
 created_seq bigint not null default nextval('private.message_revision'),
 version bigint not null default nextval('private.message_revision'),
 search_document tsvector generated always as (to_tsvector('simple',body)) stored,
 unique(channel_id,id),
 foreign key(channel_id,parent_id) references public.messages(channel_id,id),
 foreign key(channel_id,reply_to_id) references public.messages(channel_id,id),
 check(parent_id is null or parent_id<>id), check(reply_to_id is null or reply_to_id<>id)
);
create index messages_history on public.messages(channel_id,parent_id,created_seq desc);
create index messages_changes on public.messages(channel_id,version);
create index messages_author on public.messages(author_id);
create index messages_search on public.messages using gin(search_document) where deleted_at is null;
create table public.message_reactions (
 message_id uuid not null references public.messages(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 emoji text not null check(emoji in ('👍','❤️','😂','🎉','🙏','🔥','👀','✅')),
 primary key(message_id,user_id,emoji)
);
create table public.message_attachments (
 id uuid primary key,
 channel_id uuid not null references public.channels(id) on delete cascade,
 message_id uuid,
 author_id uuid references auth.users(id) on delete set null,
 storage_path text not null unique,
 filename text not null check(char_length(filename) between 1 and 120),
 mime text not null check(mime in ('image/webp','application/pdf','text/plain','text/csv')),
 kind text not null check(kind in ('photo','gif','file')),
 byte_size integer not null check(byte_size between 1 and 3145728),
 created_at timestamptz not null default now(),
 removed_at timestamptz,
 foreign key(channel_id,message_id) references public.messages(channel_id,id) on delete cascade
);
create index attachments_message on public.message_attachments(message_id) where removed_at is null;
create index attachments_owner on public.message_attachments(author_id,created_at);
create table public.read_receipts (
 channel_id uuid not null references public.channels(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 last_read_seq bigint not null default 0,
 updated_at timestamptz not null default now(),
 primary key(channel_id,user_id)
);
create index receipts_aggregate on public.read_receipts(channel_id,last_read_seq);
create table private.message_moderation (
 id uuid primary key default gen_random_uuid(),
 message_id uuid not null references public.messages(id) on delete cascade,
 actor_id uuid references auth.users(id) on delete set null,
 action text not null,
 reason text not null default '' check(char_length(reason)<=300),
 created_at timestamptz not null default now()
);
alter table private.message_moderation enable row level security;
revoke all on private.message_moderation from public,anon,authenticated;
create table public.message_link_previews (
 message_id uuid not null references public.messages(id) on delete cascade,
 url text not null check(char_length(url)<=2048),
 title text not null check(char_length(title)<=160),
 description text not null default '' check(char_length(description)<=300),
 hostname text not null check(char_length(hostname)<=253),
 created_at timestamptz not null default now(),
 primary key(message_id,url)
);

create function public.chat_message_access(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.messages where id=p_id and public.channel_access(channel_id));
$$;
create function private.chat_topic(p_channel uuid) returns text
language sql stable security definer set search_path='' as $$
 select 'chat:'||id::text||':'||realtime_epoch::text from public.channels where id=p_channel;
$$;
create function public.chat_topic_allowed(p_topic text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare cid uuid;
begin
 if p_topic is null or p_topic !~ '^chat:[a-f0-9-]{36}:[a-f0-9-]{36}$' then return false; end if;
 begin cid:=split_part(p_topic,':',2)::uuid; exception when invalid_text_representation then return false; end;
 return p_topic=private.chat_topic(cid) and public.channel_access(cid);
end $$;
-- Restrictive guards prevent unrelated broad policies granting access to chat topics.
create policy gathering_chat_receive on realtime.messages for select to authenticated
 using(extension='broadcast' and public.chat_topic_allowed((select realtime.topic())));
create policy gathering_chat_receive_guard on realtime.messages as restrictive for select to anon,authenticated
 using(coalesce((select realtime.topic()),'') not like 'chat:%' or (extension='broadcast' and public.chat_topic_allowed((select realtime.topic()))));
create policy gathering_chat_no_client_send on realtime.messages as restrictive for insert to anon,authenticated
 with check(coalesce((select realtime.topic()),'') not like 'chat:%');

alter table public.messages enable row level security;
alter table public.message_reactions enable row level security;
alter table public.message_attachments enable row level security;
alter table public.read_receipts enable row level security;
alter table public.message_link_previews enable row level security;
revoke all on public.messages,public.message_reactions,public.message_attachments,public.read_receipts,public.message_link_previews from public,anon,authenticated;
grant select on public.messages,public.message_reactions,public.read_receipts,public.message_link_previews to authenticated;
grant select(id,channel_id,message_id,author_id,filename,mime,kind,byte_size,created_at,removed_at) on public.message_attachments to authenticated;
create policy messages_read on public.messages for select to authenticated using(public.channel_access(channel_id));
create policy reactions_read on public.message_reactions for select to authenticated using(public.chat_message_access(message_id));
create policy attachments_read on public.message_attachments for select to authenticated using(
 removed_at is null and public.channel_access(channel_id) and
 ((message_id is null and author_id=auth.uid()) or exists(select 1 from public.messages m where m.id=message_id and m.deleted_at is null)));
create policy receipts_read on public.read_receipts for select to authenticated using(user_id=auth.uid() and public.channel_access(channel_id));
create policy previews_read on public.message_link_previews for select to authenticated using(exists(select 1 from public.messages m where m.id=message_id and m.deleted_at is null and public.channel_access(m.channel_id)));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('message-files','message-files',false,3145728,array['image/webp','application/pdf','text/plain','text/csv']);
create policy message_files_server_only on storage.objects as restrictive for all to anon,authenticated
 using(bucket_id<>'message-files') with check(bucket_id<>'message-files');
create policy message_bucket_server_only on storage.buckets as restrictive for all to anon,authenticated
 using(id<>'message-files') with check(id<>'message-files');

create function private.chat_require(p_channel uuid,p_permission text default 'view') returns void
language plpgsql security definer set search_path='' as $$
begin
 -- Compatible read locks permit concurrent sends, but serialize with access changes.
 perform 1 from public.communities c join public.channels ch on ch.community_id=c.id where ch.id=p_channel for key share of c;
 if not found or not coalesce(public.channel_access(p_channel,p_permission),false) or not exists(select 1 from public.channels where id=p_channel and kind='text')
 then raise exception 'Channel unavailable' using errcode='42501'; end if;
 -- Per-channel write serialization makes revision watermarks follow commit order.
 perform 1 from public.channels where id=p_channel for update;
end $$;
create function private.chat_invalidate(p_channel uuid,p_message uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 -- Realtime emits the WAL entry only after this transaction commits. No content/history.
 perform realtime.send(jsonb_build_object('id',p_message),'changed',private.chat_topic(p_channel),true);
end $$;
create function private.chat_message_changed() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='UPDATE' then new.version:=nextval('private.message_revision'); end if;
 return new;
end $$;
create trigger chat_message_revision before update on public.messages for each row execute function private.chat_message_changed();
create function private.chat_message_broadcast() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform private.chat_invalidate(new.channel_id,new.id);
 if new.parent_id is not null then update public.messages set version=version where id=new.parent_id; end if;
 return new;
end $$;
create trigger chat_message_broadcast after insert or update on public.messages for each row execute function private.chat_message_broadcast();
create function private.chat_reaction_changed() returns trigger
language plpgsql security definer set search_path='' as $$
begin update public.messages set version=version where id=coalesce(new.message_id,old.message_id); return coalesce(new,old); end $$;
create trigger chat_reaction_changed after insert or delete on public.message_reactions for each row execute function private.chat_reaction_changed();

create function private.chat_rotate_community(p_community uuid) returns void
language plpgsql security definer set search_path='' as $$
declare c record;
begin
 for c in select id,realtime_epoch from public.channels where community_id=p_community loop
  perform realtime.send('{}','access_changed','chat:'||c.id::text||':'||c.realtime_epoch::text,true);
 end loop;
 update public.channels set realtime_epoch=gen_random_uuid() where community_id=p_community;
end $$;
create function private.chat_membership_changed() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform private.chat_rotate_community(coalesce(new.community_id,old.community_id));
 return coalesce(new,old);
end $$;
create trigger chat_membership_changed after insert or update or delete on public.community_members for each row execute function private.chat_membership_changed();
create trigger chat_override_changed after insert or update or delete on public.channel_permission_overrides for each row execute function private.chat_membership_changed();
create function private.chat_channel_changed() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform realtime.send('{}','access_changed','chat:'||old.id::text||':'||old.realtime_epoch::text,true);
 new.realtime_epoch:=gen_random_uuid();return new;
end $$;
create trigger chat_channel_changed before update of is_private,kind on public.channels for each row execute function private.chat_channel_changed();
create function private.chat_identity_changed() returns trigger
language plpgsql security definer set search_path='' as $$
declare c record;
begin
 for c in select distinct community_id from public.community_members where user_id=old.id loop
  perform private.chat_rotate_community(c.community_id);
 end loop;
 return new;
end $$;
create trigger chat_identity_changed after update of email_confirmed_at,banned_until,deleted_at on auth.users for each row execute function private.chat_identity_changed();

create function public.send_channel_message(p_id uuid,p_channel uuid,p_body text,p_parent uuid default null,p_reply_to uuid default null,p_attachments uuid[] default '{}') returns uuid
language plpgsql security definer set search_path='' as $$
declare existing public.messages; parent public.messages; a uuid; n integer; actor uuid:=auth.uid();
begin
 perform private.chat_require(p_channel,'post');
 if p_id is null then raise exception 'Invalid message ID' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into existing from public.messages where id=p_id;
 if found then
  if existing.channel_id=p_channel and existing.author_id=actor then return existing.id; end if;
  raise exception 'Message unavailable' using errcode='42501';
 end if;
 if p_id is null or p_body is null or char_length(p_body)>4000 or coalesce(cardinality(p_attachments),0)>4 or
 (p_body !~ '[^[:space:]]' and coalesce(cardinality(p_attachments),0)=0) or p_body ~ '[\x01-\x08\x0B\x0C\x0E-\x1F]' then raise exception 'Invalid message' using errcode='22023'; end if;
 if not private.take_limit('chat-send:'||actor::text,20,60) then raise exception 'Please wait before sending again' using errcode='P0001'; end if;
 if exists(select 1 from public.messages where author_id=actor and channel_id=p_channel and body=p_body and deleted_at is null and created_at>clock_timestamp()-interval '3 seconds') then raise exception 'Please wait before repeating a message' using errcode='P0001'; end if;
 if p_parent is not null then
  select * into parent from public.messages where id=p_parent and channel_id=p_channel and parent_id is null and deleted_at is null;
  if not found then raise exception 'Thread unavailable' using errcode='42501'; end if;
 end if;
 if p_reply_to is not null and not exists(select 1 from public.messages where id=p_reply_to and channel_id=p_channel and deleted_at is null and (id=p_parent or parent_id=p_parent)) then raise exception 'Reply unavailable' using errcode='42501'; end if;
 -- Atomically claim staged files before returning; any failure rolls back the send.
 insert into public.messages(id,channel_id,author_id,parent_id,reply_to_id,body) values(p_id,p_channel,actor,p_parent,p_reply_to,p_body);
 foreach a in array coalesce(p_attachments,'{}') loop
  update public.message_attachments set message_id=p_id where id=a and channel_id=p_channel and author_id=actor and message_id is null and removed_at is null and created_at>now()-interval '24 hours';
  get diagnostics n=row_count;
  if n<>1 then raise exception 'Attachment unavailable' using errcode='42501'; end if;
 end loop;
 return p_id;
end $$;

create function public.change_channel_message(p_id uuid,p_operation text,p_body text default '',p_reason text default '') returns boolean
language plpgsql security definer set search_path='' as $$
declare m public.messages; r integer;
begin
 select * into m from public.messages where id=p_id;
 if not found then raise exception 'Message unavailable' using errcode='42501'; end if;
 perform private.chat_require(m.channel_id,case when p_operation='edit' then 'post' else 'view' end);
 select * into m from public.messages where id=p_id for update;
 if not private.take_limit('chat-edit:'||auth.uid()::text,40,60) then raise exception 'Please try later' using errcode='P0001'; end if;
 if p_operation='edit' then
  if m.author_id is distinct from auth.uid() or m.deleted_at is not null then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_body is null or char_length(p_body)>4000 or p_body !~ '[^[:space:]]' or p_body ~ '[\x01-\x08\x0B\x0C\x0E-\x1F]' then raise exception 'Invalid message' using errcode='22023'; end if;
  update public.messages set body=p_body,edited_at=clock_timestamp() where id=p_id;
  delete from public.message_link_previews where message_id=p_id;
 elsif p_operation='delete' then
  select private.community_rank(community_id) into r from public.channels where id=m.channel_id;
  if m.author_id is distinct from auth.uid() and r<20 then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_reason is null or char_length(p_reason)>300 then raise exception 'Invalid reason' using errcode='22023'; end if;
  if m.deleted_at is null then
   update public.messages set body='',deleted_at=clock_timestamp() where id=p_id;
   delete from public.message_reactions where message_id=p_id;
   delete from public.message_link_previews where message_id=p_id;
   insert into private.message_moderation(message_id,actor_id,action,reason) values(p_id,auth.uid(),case when m.author_id=auth.uid() then 'author_delete' else 'moderator_delete' end,p_reason);
  end if;
 else raise exception 'Invalid operation' using errcode='22023'; end if;
 return true;
end $$;
create function public.set_message_reaction(p_message uuid,p_emoji text,p_active boolean) returns boolean
language plpgsql security definer set search_path='' as $$
declare m public.messages;
begin
 select * into m from public.messages where id=p_message;
 if not found then raise exception 'Message unavailable' using errcode='42501'; end if;
 perform private.chat_require(m.channel_id,'post');
 perform 1 from public.messages where id=p_message and deleted_at is null for update;
 if not found or p_emoji is null or p_emoji not in ('👍','❤️','😂','🎉','🙏','🔥','👀','✅') or p_active is null then raise exception 'Reaction unavailable' using errcode='22023'; end if;
 if not private.take_limit('chat-react:'||auth.uid()::text,60,60) then raise exception 'Please try later' using errcode='P0001'; end if;
 if p_active then insert into public.message_reactions values(p_message,auth.uid(),p_emoji) on conflict do nothing;
 else delete from public.message_reactions where message_id=p_message and user_id=auth.uid() and emoji=p_emoji; end if;
 return true;
end $$;
create function private.chat_message_dto(m public.messages) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',m.id,'channel_id',m.channel_id,'author_id',m.author_id,
 'author_name',coalesce(nullif(p.display_name,''),p.username,'Former member'),'author_avatar',coalesce(public.visible_avatar(m.author_id) is not null,false),
 'parent_id',m.parent_id,'reply_to_id',m.reply_to_id,'body',m.body,'created_at',m.created_at,'edited_at',m.edited_at,'deleted_at',m.deleted_at,
 'created_seq',m.created_seq::text,'version',m.version::text,
 'reply_count',(select count(*) from public.messages where parent_id=m.id and deleted_at is null),
 'read_count',(select count(*) from public.read_receipts r where r.channel_id=m.channel_id and r.user_id is distinct from m.author_id and r.last_read_seq>=m.created_seq),
 'reactions',coalesce((select jsonb_agg(x) from (select emoji,count(*)::integer as count,bool_or(user_id=auth.uid()) as mine from public.message_reactions where message_id=m.id group by emoji order by emoji) x),'[]'),
 'attachments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'filename',a.filename,'mime',a.mime,'kind',a.kind,'byte_size',a.byte_size) order by a.created_at,a.id) from public.message_attachments a where a.message_id=m.id and a.removed_at is null and m.deleted_at is null),'[]'),
 'previews',coalesce((select jsonb_agg(jsonb_build_object('url',l.url,'title',l.title,'description',l.description,'hostname',l.hostname)) from public.message_link_previews l where l.message_id=m.id and m.deleted_at is null),'[]'))
 from (values(1)) dummy(n) left join public.profiles p on p.id=m.author_id;
$$;
create function public.chat_page(p_channel uuid,p_parent uuid default null,p_before bigint default null,p_search text default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare items jsonb;
begin
 if not public.channel_access(p_channel) then raise exception 'Channel unavailable' using errcode='42501'; end if;
 if p_search is not null and (char_length(p_search)>100 or char_length(btrim(p_search))<2) then raise exception 'Invalid search' using errcode='22023'; end if;
 select coalesce(jsonb_agg(private.chat_message_dto(x) order by x.created_seq),'[]') into items from (
  select m.* from public.messages m where m.channel_id=p_channel and
  (case when p_search is not null then m.deleted_at is null and m.search_document @@ plainto_tsquery('simple',p_search) else m.parent_id is not distinct from p_parent end)
  and (p_before is null or m.created_seq<p_before) order by m.created_seq desc limit 40
 ) x;
 return jsonb_build_object('messages',items,'watermark',coalesce((select max(version) from public.messages where channel_id=p_channel),0)::text,
 'last_read_seq',coalesce((select last_read_seq from public.read_receipts where channel_id=p_channel and user_id=auth.uid()),0)::text,
 'unread_count',(select count(*) from public.messages m where m.channel_id=p_channel and m.author_id is distinct from auth.uid() and m.deleted_at is null and m.created_seq>coalesce((select last_read_seq from public.read_receipts where channel_id=p_channel and user_id=auth.uid()),0)));
end $$;
create function public.chat_message(p_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select private.chat_message_dto(m) from public.messages m where m.id=p_id and public.channel_access(m.channel_id);
$$;
create function public.chat_changes(p_channel uuid,p_after bigint) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.channel_access(p_channel) then raise exception 'Channel unavailable' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(private.chat_message_dto(x) order by x.version) from (select * from public.messages where channel_id=p_channel and version>p_after order by version limit 200) x),'[]');
end $$;
create function public.chat_session(p_channel uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare can_post boolean; role text;
begin
 if not public.channel_access(p_channel) then raise exception 'Channel unavailable' using errcode='42501'; end if;
 select public.community_my_role(community_id) into role from public.channels where id=p_channel;
 can_post:=public.channel_access(p_channel,'post');
 return jsonb_build_object('topic',private.chat_topic(p_channel),'can_post',can_post,'role',role);
end $$;
create function public.mark_channel_read(p_channel uuid,p_message uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare s bigint;
begin
 perform private.chat_require(p_channel);
 select created_seq into s from public.messages where id=p_message and channel_id=p_channel;
 if s is null then raise exception 'Message unavailable' using errcode='42501'; end if;
 insert into public.read_receipts(channel_id,user_id,last_read_seq) values(p_channel,auth.uid(),s)
 on conflict(channel_id,user_id) do update set last_read_seq=greatest(public.read_receipts.last_read_seq,excluded.last_read_seq),updated_at=now()
 where public.read_receipts.last_read_seq<excluded.last_read_seq;
 if found then perform realtime.send('{}','receipt',private.chat_topic(p_channel),true); end if;
 return true;
end $$;
create function public.channel_unread_counts(p_community uuid) returns table(channel_id uuid,unread_count bigint)
language sql stable security definer set search_path='' as $$
 select c.id,count(m.id) from public.channels c
 left join public.read_receipts r on r.channel_id=c.id and r.user_id=auth.uid()
 left join public.messages m on m.channel_id=c.id and m.created_seq>coalesce(r.last_read_seq,0) and m.author_id is distinct from auth.uid() and m.deleted_at is null
 where c.community_id=p_community and c.kind='text' and public.channel_access(c.id) group by c.id;
$$;
create function public.chat_typing(p_channel uuid,p_active boolean) returns boolean
language plpgsql security definer set search_path='' as $$
declare name text;
begin
 perform private.chat_require(p_channel,'post');
 if not private.take_limit('chat-type:'||auth.uid()::text,30,60) then return false; end if;
 select coalesce(nullif(display_name,''),username,'Member') into name from public.profiles where id=auth.uid();
 perform realtime.send(jsonb_build_object('user_id',auth.uid(),'name',name,'until',case when p_active then clock_timestamp()+interval '6 seconds' else clock_timestamp() end),'typing',private.chat_topic(p_channel),true);
 return true;
end $$;
create function public.register_message_attachment(p_id uuid,p_channel uuid,p_path text,p_filename text,p_mime text,p_kind text,p_size integer) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 perform private.chat_require(p_channel,'post');
 if p_path is null or p_path<>p_channel::text||'/'||auth.uid()::text||'/'||p_id::text or
 not exists(select 1 from storage.objects where bucket_id='message-files' and name=p_path) then raise exception 'File unavailable' using errcode='42501'; end if;
 if not private.take_limit('chat-upload:'||auth.uid()::text,20,900) then raise exception 'Upload limit reached' using errcode='P0001'; end if;
 insert into public.message_attachments(id,channel_id,author_id,storage_path,filename,mime,kind,byte_size) values(p_id,p_channel,auth.uid(),p_path,p_filename,p_mime,p_kind,p_size);
 return true;
end $$;
create function public.chat_preview_budget(p_message uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if not public.chat_message_access(p_message) then return false; end if;
 return private.take_limit('chat-preview:'||auth.uid()::text,20,60);
end $$;
-- On identity deletion remove content, keep stable tombstones/threads and moderation history.
create function private.chat_account_deleted() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 update public.messages set body='',deleted_at=coalesce(deleted_at,clock_timestamp()) where author_id=old.id;
 delete from public.message_link_previews where message_id in(select id from public.messages where author_id=old.id);
 return old;
end $$;
create trigger chat_account_deleted before delete on auth.users for each row execute function private.chat_account_deleted();

-- No callers can execute private privileged helpers or bypass fixed actor/ACL checks.
revoke all on function private.chat_topic(uuid),private.chat_require(uuid,text),private.chat_invalidate(uuid,uuid),private.chat_message_changed(),private.chat_message_broadcast(),private.chat_reaction_changed(),private.chat_rotate_community(uuid),private.chat_membership_changed(),private.chat_channel_changed(),private.chat_identity_changed(),private.chat_message_dto(public.messages),private.chat_account_deleted() from public,anon,authenticated;
revoke all on function public.chat_message_access(uuid),public.chat_topic_allowed(text),public.send_channel_message(uuid,uuid,text,uuid,uuid,uuid[]),public.change_channel_message(uuid,text,text,text),public.set_message_reaction(uuid,text,boolean),public.chat_page(uuid,uuid,bigint,text),public.chat_message(uuid),public.chat_changes(uuid,bigint),public.chat_session(uuid),public.mark_channel_read(uuid,uuid),public.channel_unread_counts(uuid),public.chat_typing(uuid,boolean),public.register_message_attachment(uuid,uuid,text,text,text,text,integer),public.chat_preview_budget(uuid) from public,anon,authenticated;
grant execute on function public.chat_message_access(uuid),public.chat_topic_allowed(text),public.send_channel_message(uuid,uuid,text,uuid,uuid,uuid[]),public.change_channel_message(uuid,text,text,text),public.set_message_reaction(uuid,text,boolean),public.chat_page(uuid,uuid,bigint,text),public.chat_message(uuid),public.chat_changes(uuid,bigint),public.chat_session(uuid),public.mark_channel_read(uuid,uuid),public.channel_unread_counts(uuid),public.chat_typing(uuid,boolean),public.register_message_attachment(uuid,uuid,text,text,text,text,integer),public.chat_preview_budget(uuid) to authenticated;
notify pgrst,'reload schema';
