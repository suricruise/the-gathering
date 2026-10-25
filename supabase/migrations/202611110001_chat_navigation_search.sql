-- Stage 7: additive private navigation/preferences, scoped search and mention controls.
alter table public.messages add column mass_mention_role text check(mass_mention_role in ('*','member','moderator','administrator','owner'));
create function private.chat_mention_text(value text) returns text language sql immutable set search_path='' as $$
 select regexp_replace(regexp_replace(coalesce(value,''),'(?s)```.*?```','','g'),'`[^`]*`','','g');
$$;
create table public.chat_navigation_preferences(
 user_id uuid not null references auth.users on delete cascade,
 community_id uuid not null references public.communities on delete cascade,
 last_channel_id uuid references public.channels on delete set null,
 collapsed_categories text[] not null default '{}',
 primary key(user_id,community_id),check(cardinality(collapsed_categories)<=100)
);
create table public.chat_notification_settings(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users on delete cascade,
 community_id uuid not null references public.communities on delete cascade,
 channel_id uuid references public.channels on delete cascade,
 mode text not null check(mode in ('inherit','all','mentions','muted')),
 unique nulls not distinct(user_id,community_id,channel_id)
);
create table private.chat_navigation_budgets(user_id uuid not null references auth.users on delete cascade,operation text not null,scope uuid not null,started_at timestamptz not null default now(),attempts integer not null default 1,primary key(user_id,operation,scope));
alter table public.chat_navigation_preferences enable row level security;
alter table public.chat_notification_settings enable row level security;
alter table private.chat_navigation_budgets enable row level security;
revoke all on public.chat_navigation_preferences,public.chat_notification_settings,private.chat_navigation_budgets from public,anon,authenticated;
grant select on public.chat_navigation_preferences,public.chat_notification_settings to authenticated;
create function public.chat_settings_access(c uuid,ch uuid default null) returns boolean language sql stable security definer set search_path='' as $$
 select private.squad_live(auth.uid()) and private.community_rank(c)>=10 and (ch is null or exists(select 1 from public.channels where id=ch and community_id=c and public.channel_access(id)));
$$;
create policy chat_navigation_own on public.chat_navigation_preferences for select to authenticated using(user_id=auth.uid() and public.chat_settings_access(community_id));
create policy chat_settings_own on public.chat_notification_settings for select to authenticated using(user_id=auth.uid() and public.chat_settings_access(community_id,channel_id));
create function private.chat_navigation_take(u uuid,op text,s uuid,lim integer,seconds integer) returns boolean language plpgsql security definer set search_path='' as $$declare n integer;begin
 insert into private.chat_navigation_budgets(user_id,operation,scope) values(u,op,s) on conflict(user_id,operation,scope) do update set attempts=case when private.chat_navigation_budgets.started_at<clock_timestamp()-make_interval(secs=>seconds) then 1 else private.chat_navigation_budgets.attempts+1 end,started_at=case when private.chat_navigation_budgets.started_at<clock_timestamp()-make_interval(secs=>seconds) then clock_timestamp() else private.chat_navigation_budgets.started_at end returning attempts into n;return n<=lim;
end$$;
create function public.chat_workspace_state(p_community uuid,p_channel uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if not private.squad_live(auth.uid()) or private.community_rank(p_community)<10 or (p_channel is not null and not exists(select 1 from public.channels where id=p_channel and community_id=p_community and public.channel_access(id))) then raise exception 'Unavailable' using errcode='42501';end if;
 return jsonb_build_object('collapsed',coalesce((select to_jsonb(collapsed_categories) from public.chat_navigation_preferences where user_id=auth.uid() and community_id=p_community),'[]'::jsonb),'last_channel', (select last_channel_id from public.chat_navigation_preferences where user_id=auth.uid() and community_id=p_community and public.channel_access(last_channel_id)),
 'community_mode',coalesce((select mode from public.chat_notification_settings where user_id=auth.uid() and community_id=p_community and channel_id is null),'inherit'),
 'channel_mode',coalesce((select mode from public.chat_notification_settings where user_id=auth.uid() and channel_id=p_channel),'inherit'),
 'username',(select username from public.profiles where id=auth.uid()),'can_mass_mention',private.community_rank(p_community)>=30);
end$$;
create function public.chat_save_navigation(p_channel uuid,p_collapsed text[] default null) returns jsonb language plpgsql security definer set search_path='' as $$declare cid uuid;begin
 perform private.chat_require(p_channel);select community_id into cid from public.channels where id=p_channel;
 if not private.chat_navigation_take(auth.uid(),'navigation',cid,120,60) then raise exception 'Please wait' using errcode='P0001';end if;
 if p_collapsed is not null and (cardinality(p_collapsed)>100 or exists(select 1 from unnest(p_collapsed) k where k is null or (k<>'uncategorized' and not exists(select 1 from public.channel_categories where id::text=k and community_id=cid)))) then raise exception 'Invalid categories' using errcode='22023';end if;
 insert into public.chat_navigation_preferences(user_id,community_id,last_channel_id,collapsed_categories) values(auth.uid(),cid,p_channel,coalesce(p_collapsed,'{}')) on conflict(user_id,community_id) do update set last_channel_id=case when p_collapsed is null then p_channel else public.chat_navigation_preferences.last_channel_id end,collapsed_categories=coalesce(p_collapsed,public.chat_navigation_preferences.collapsed_categories);
 return public.chat_workspace_state(cid,p_channel);
end$$;
create function public.chat_save_notifications(p_channel uuid,p_community_mode text,p_channel_mode text) returns jsonb language plpgsql security definer set search_path='' as $$declare cid uuid;begin
 perform private.chat_require(p_channel);select community_id into cid from public.channels where id=p_channel;
 if p_community_mode is null or p_channel_mode is null or p_community_mode not in ('inherit','all','mentions','muted') or p_channel_mode not in ('inherit','all','mentions','muted') then raise exception 'Invalid preference' using errcode='22023';end if;
 if not private.chat_navigation_take(auth.uid(),'preferences',cid,30,60) then raise exception 'Please wait' using errcode='P0001';end if;
 insert into public.chat_notification_settings(user_id,community_id,channel_id,mode) values(auth.uid(),cid,null,p_community_mode),(auth.uid(),cid,p_channel,p_channel_mode) on conflict(user_id,community_id,channel_id) do update set mode=excluded.mode;
 perform realtime.send('{}','chat_summary','people:'||auth.uid()::text,true);perform realtime.send('{}','changed','people:'||auth.uid()::text,true);
 return public.chat_workspace_state(cid,p_channel);
end$$;
create function private.chat_delivery_mode(u uuid,c uuid) returns text language sql stable security definer set search_path='' as $$
 select case when coalesce(cm.mode,'inherit')='muted' then 'muted' else coalesce(nullif(ch.mode,'inherit'),nullif(cm.mode,'inherit'),'inherit') end from public.channels c0 left join public.chat_notification_settings ch on ch.user_id=u and ch.channel_id=c0.id left join public.chat_notification_settings cm on cm.user_id=u and cm.community_id=c0.community_id and cm.channel_id is null where c0.id=c;
$$;
create function private.chat_delivery_allowed(u uuid,m uuid,k text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.messages msg where msg.id=m and msg.deleted_at is null and private.channel_user_allowed(u,msg.channel_id) and private.chat_delivery_mode(u,msg.channel_id)<>'muted' and (private.chat_delivery_mode(u,msg.channel_id)<>'mentions' or k='mentions'));
$$;
create function public.chat_search(p_community uuid,p_query text default '',p_channel uuid default null,p_author text default null,p_from date default null,p_until date default null,p_before bigint default null,p_threads boolean default true) returns jsonb language plpgsql security definer set search_path='' as $$declare items jsonb;begin
 if not private.squad_live(auth.uid()) or private.community_rank(p_community)<10 or (p_channel is not null and not exists(select 1 from public.channels where id=p_channel and community_id=p_community and public.channel_access(id))) then raise exception 'Unavailable' using errcode='42501';end if;
 if p_query is null or length(p_query)>100 or (length(trim(p_query))<2 and p_author is null and p_from is null and p_until is null) or (p_author is not null and p_author!~'^[a-z][a-z0-9_]{2,23}$') or (p_from is not null and p_until is not null and p_from>p_until) or p_before<0 or p_threads is null then raise exception 'Invalid search' using errcode='22023';end if;
 if not private.chat_navigation_take(auth.uid(),'search',p_community,30,60) then raise exception 'Please wait' using errcode='P0001';end if;
 select coalesce(jsonb_agg(x.item order by x.seq desc),'[]'::jsonb) into items from (
 select m.created_seq seq,jsonb_build_object('id',m.id,'channel_id',m.channel_id,'channel_name',c.name,'parent_id',m.parent_id,'author_name',coalesce(p.display_name,'Member'),'created_at',m.created_at,'created_seq',m.created_seq::text,
 'snippet',case when length(trim(p_query))>=2 then left(ts_headline('simple',m.body,websearch_to_tsquery('simple',p_query),'StartSel="", StopSel="", MaxWords=40, MinWords=15, MaxFragments=2'),500) else left(m.body,300) end) item
 from public.messages m join public.channels c on c.id=m.channel_id left join public.profiles p on p.id=m.author_id
 where c.community_id=p_community and (p_channel is null or m.channel_id=p_channel) and public.channel_access(c.id) and m.deleted_at is null
 and (p_threads or m.parent_id is null) and (p_before is null or m.created_seq<p_before) and (length(trim(p_query))<2 or m.search_document @@ websearch_to_tsquery('simple',p_query))
 and (p_author is null or p.username=p_author) and (p_from is null or m.created_at>=p_from::timestamp at time zone 'UTC') and (p_until is null or m.created_at<(p_until+1)::timestamp at time zone 'UTC') order by m.created_seq desc limit 31)x;
 return jsonb_build_object('items',items);
end$$;
-- Validate both initial sends and edits. Notifications are emitted only on initial insertion.
create function private.chat_mention_guard() returns trigger language plpgsql security definer set search_path='' as $$declare cid uuid;tokens text[];target text;begin
 if new.body is null then return new;end if;
 if (select count(distinct m[1]) from regexp_matches(lower(private.chat_mention_text(new.body)),'(?:^|\s)@([a-z][a-z0-9_]{2,23})\M','g')m where m[1] not in ('everyone','role'))>5 then raise exception 'At most five member mentions' using errcode='22023';end if;
 select array_agg(distinct m[1]) into tokens from regexp_matches(lower(private.chat_mention_text(new.body)),'(?:^|\s)@(everyone|role:[a-z]+)\M','g')m;
 new.mass_mention_role:=null;
 if tokens is null then return new;end if;
 select community_id into cid from public.channels where id=new.channel_id;
 if private.space_rank(new.author_id,cid)<30 then raise exception 'Mass mentions require an administrator' using errcode='42501';end if;
 if cardinality(tokens)>1 then raise exception 'One mass mention per message' using errcode='22023';end if;target:=tokens[1];
 if target not in ('everyone','role:member','role:moderator','role:administrator','role:owner') then raise exception 'Invalid role' using errcode='22023';end if;
 new.mass_mention_role:=case when target='everyone' then '*' else substring(target from 6) end;
 if tg_op='INSERT' then
 if (select count(*) from public.community_members m where m.community_id=cid and m.status='active' and private.channel_user_allowed(m.user_id,new.channel_id) and (target='everyone' or m.role_id=substring(target from 6)))>200 then raise exception 'Mass mention audience exceeds 200' using errcode='22023';end if;
 if not private.chat_navigation_take(new.author_id,'mass_mentions',cid,1,300) then raise exception 'Mass mention cooldown' using errcode='P0001';end if;end if;return new;
end$$;
create trigger chat_mention_validation before insert or update of body on public.messages for each row execute function private.chat_mention_guard();
create function private.chat_scope_notifications() returns trigger language plpgsql security definer set search_path='' as $$declare recipient record;target text;begin
 select m[1] into target from regexp_matches(lower(private.chat_mention_text(new.body)),'(?:^|\s)@(everyone|role:[a-z]+)\M')m;
 if target is not null then
 for recipient in select m.user_id from public.community_members m join public.channels c on c.community_id=m.community_id where c.id=new.channel_id and m.status='active' and (target='everyone' or m.role_id=substring(target from 6)) and private.channel_user_allowed(m.user_id,new.channel_id) loop
 perform private.emit_notification(recipient.user_id,new.author_id,'mentions','channel',new.id,'mention:messages:'||new.id::text||':'||recipient.user_id::text);end loop;end if;
 if new.parent_id is null then
 for recipient in select m.user_id from public.community_members m join public.channels c on c.community_id=m.community_id where c.id=new.channel_id and m.status='active' and private.chat_delivery_mode(m.user_id,c.id)='all' and private.channel_user_allowed(m.user_id,c.id) and not exists(select 1 from public.notifications n where n.recipient_id=m.user_id and n.resource_id=new.id) loop
 perform private.emit_notification(recipient.user_id,new.author_id,'replies','channel',new.id,'chat-all:'||new.id::text||':'||recipient.user_id::text);end loop;end if;return new;
end$$;
create trigger zz_chat_scope_notifications after insert on public.messages for each row execute function private.chat_scope_notifications();

create or replace function public.notification_access(p_id bigint) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.notifications n join public.notification_preferences pref on pref.user_id=n.recipient_id where n.id=p_id and n.recipient_id=auth.uid() and (n.actor_id is null or not private.squad_blocked(auth.uid(),n.actor_id)) and coalesce((to_jsonb(pref)->>n.kind)::boolean,false) and private.notification_resource(auth.uid(),n.resource_type,n.resource_id)
 and (n.resource_type<>'channel' or private.chat_delivery_allowed(auth.uid(),n.resource_id,n.kind))
 and (n.kind not in ('event_reminders','event_updates') or exists(select 1 from public.event_rsvps where event_id=n.resource_id and user_id=auth.uid() and response='going'))
 and (n.kind<>'event_reminders' or exists(select 1 from public.events e join public.user_preferences up on up.user_id=auth.uid() where e.id=n.resource_id and up.event_reminders and e.status='scheduled' and e.starts_at>now() and n.dedupe_key like 'reminder:'||e.id::text||':'||e.revision::text||':%')));
$$;
create or replace function private.emit_notification(u uuid,a uuid,k text,t text,r uuid,d text) returns void language plpgsql security definer set search_path='' as $$
begin
 if u is null or u=a or not private.squad_live(u) or (a is not null and (not private.squad_live(a) or private.squad_blocked(u,a))) or not private.notification_resource(u,t,r) or not exists(select 1 from public.notification_preferences p where user_id=u and coalesce((to_jsonb(p)->>k)::boolean,false)) then return;end if;
 if u is not null and t='channel' and (not private.chat_delivery_allowed(u,r,k) or not private.chat_navigation_take(u,'notification_delivery','00000000-0000-0000-0000-000000000000',60,300)) then return;end if;
 insert into public.notifications(recipient_id,actor_id,kind,resource_type,resource_id,dedupe_key) values(u,a,k,t,r,d) on conflict(dedupe_key) do nothing;
 if found then perform realtime.send('{}'::jsonb,'changed','people:'||u::text,true);end if;
end $$;

create or replace function private.chat_message_dto(m public.messages) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',m.id,'channel_id',m.channel_id,'author_id',m.author_id,
 'author_name',coalesce(nullif(p.display_name,''),p.username,'Former member'),'author_avatar',coalesce(public.visible_avatar(m.author_id) is not null,false),
 'pinned_at',m.pinned_at,'mass_mention_role',case when m.deleted_at is null then m.mass_mention_role else null end,'parent_id',m.parent_id,'reply_to_id',m.reply_to_id,'body',m.body,'created_at',m.created_at,'edited_at',m.edited_at,'deleted_at',m.deleted_at,
 'created_seq',m.created_seq::text,'version',m.version::text,
 'thread_latest_at',(select created_at from public.messages where channel_id=m.channel_id and parent_id=m.id and deleted_at is null order by created_seq desc limit 1),
 'reply_count',(select count(*) from public.messages where parent_id=m.id and deleted_at is null),
 'read_count',(select count(*) from public.read_receipts r where r.channel_id=m.channel_id and r.user_id is distinct from m.author_id and r.last_read_seq>=m.created_seq),
 'reactions',coalesce((select jsonb_agg(x) from (select emoji,count(*)::integer as count,bool_or(user_id=auth.uid()) as mine from public.message_reactions where message_id=m.id group by emoji order by emoji) x),'[]'),
 'attachments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'filename',a.filename,'mime',a.mime,'kind',a.kind,'byte_size',a.byte_size) order by a.created_at,a.id) from public.message_attachments a where a.message_id=m.id and a.removed_at is null and m.deleted_at is null),'[]'),
 'previews',coalesce((select jsonb_agg(jsonb_build_object('url',l.url,'title',l.title,'description',l.description,'hostname',l.hostname)) from public.message_link_previews l where l.message_id=m.id and m.deleted_at is null),'[]'))
 from (values(1)) dummy(n) left join public.profiles p on p.id=m.author_id;
$$;
create or replace function private.space_mentions(a uuid,body text,t text,r uuid,seed text) returns void language plpgsql security definer set search_path='' as $$
declare person record;begin
 for person in select distinct p.id from regexp_matches(lower(case when t='channel' then private.chat_mention_text(body) else body end),'(?:^|\s)@([a-z][a-z0-9_]{2,23})\M','g') m join public.profiles p on p.username=m[1] where t<>'channel' or (p.username not in ('everyone','role') and not (lower(case when t='channel' then private.chat_mention_text(body) else body end) ~ ('(?:^|\s)@'||p.username||':'))) limit 5 loop
  perform private.emit_notification(person.id,a,'mentions',t,r,'mention:'||seed||':'||person.id::text);
 end loop;
end $$;

create function public.chat_first_unread(p_channel uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$declare msg public.messages;begin
 if not coalesce(public.channel_access(p_channel),false) then raise exception 'Unavailable' using errcode='42501';end if;
 select m.* into msg from public.messages m where m.channel_id=p_channel and m.deleted_at is null and m.author_id is distinct from auth.uid() and m.created_seq>coalesce((select last_read_seq from public.read_receipts where channel_id=p_channel and user_id=auth.uid()),0) order by created_seq limit 1;
 if not found then return null;end if;return private.chat_message_dto(msg);
end$$;
revoke all on function public.chat_settings_access(uuid,uuid),public.chat_first_unread(uuid),public.chat_workspace_state(uuid,uuid),public.chat_save_navigation(uuid,text[]),public.chat_save_notifications(uuid,text,text),public.chat_search(uuid,text,uuid,text,date,date,bigint,boolean),private.chat_mention_text(text),private.chat_navigation_take(uuid,text,uuid,integer,integer),private.chat_delivery_mode(uuid,uuid),private.chat_delivery_allowed(uuid,uuid,text),private.chat_mention_guard(),private.chat_scope_notifications(),private.emit_notification(uuid,uuid,text,text,uuid,text),public.notification_access(bigint) from public,anon,authenticated;
grant execute on function public.chat_settings_access(uuid,uuid),public.chat_first_unread(uuid),public.chat_workspace_state(uuid,uuid),public.chat_save_navigation(uuid,text[]),public.chat_save_notifications(uuid,text,text),public.chat_search(uuid,text,uuid,text,date,date,bigint,boolean),public.notification_access(bigint) to authenticated;
notify pgrst,'reload schema';
