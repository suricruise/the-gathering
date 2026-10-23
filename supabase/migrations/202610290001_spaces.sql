-- Phase 10: community-only faith spaces, events and consent-based notification metadata.
create table public.prayer_requests (
 id uuid primary key, seq bigint generated always as identity unique,
 community_id uuid not null references public.communities on delete cascade,
 author_id uuid not null references auth.users on delete cascade,
 body text not null check(length(body)<=4000),
 visibility text not null check(visibility in ('community','moderators')),
 status text not null default 'open' check(status in ('open','answered','hidden','removed')),
 guidelines_accepted_at timestamptz not null default now(),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index prayer_page on public.prayer_requests(community_id,seq desc);
create table public.prayer_comments (
 id uuid primary key,seq bigint generated always as identity unique,
 prayer_id uuid not null references public.prayer_requests on delete cascade,
 author_id uuid not null references auth.users on delete cascade,
 body text not null check(length(btrim(body)) between 1 and 2000),
 created_at timestamptz not null default now()
);
create index prayer_comment_page on public.prayer_comments(prayer_id,seq);
create table public.prayer_encouragements (
 prayer_id uuid references public.prayer_requests on delete cascade,
 user_id uuid references auth.users on delete cascade,
 primary key(prayer_id,user_id)
);
create table public.events (
 id uuid primary key,seq bigint generated always as identity unique,
 community_id uuid not null references public.communities on delete cascade,
 host_id uuid not null references auth.users on delete cascade,
 title text not null check(length(btrim(title)) between 3 and 100),
 description text not null check(length(btrim(description)) between 1 and 5000),
 kind text not null check(kind in ('gaming','voice','discussion')),
 banner text not null check(banner in ('nebula','aurora','ember','ocean')),
 starts_at timestamptz not null,ends_at timestamptz not null,time_zone text not null,
 gaming_session_id uuid references public.gaming_sessions on delete set null,
 voice_channel_id uuid references public.channels on delete set null,
 status text not null default 'scheduled' check(status in ('scheduled','cancelled')),
 revision integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(ends_at>starts_at and ends_at<=starts_at+interval '7 days'),check(num_nonnulls(gaming_session_id,voice_channel_id)<=1)
);
create index events_page on public.events(community_id,seq desc);
create index events_reminder_window on public.events(starts_at) where status='scheduled';
create table public.event_rsvps (
 event_id uuid references public.events on delete cascade,user_id uuid references auth.users on delete cascade,
 response text not null check(response in ('going','interested','declined')),
 updated_at timestamptz not null default now(),primary key(event_id,user_id)
);
create index rsvps_user on public.event_rsvps(user_id,event_id);
create table public.notification_preferences (
 user_id uuid primary key references auth.users on delete cascade,
 friend_requests boolean not null default true,replies boolean not null default true,
 mentions boolean not null default false,community_invitations boolean not null default false,
 event_reminders boolean not null default false,event_updates boolean not null default true,
 gaming_invitations boolean not null default false,moderator_notices boolean not null default true,
 daily_content boolean not null default false
);
create table public.community_notification_invitations (
 id uuid primary key default gen_random_uuid(),community_id uuid not null references public.communities on delete cascade,
 sender_id uuid not null references auth.users on delete cascade,recipient_id uuid not null references auth.users on delete cascade,
 invitation_id uuid not null references public.invitations on delete cascade,
 status text not null default 'pending' check(status in ('pending','accepted','declined')),
 expires_at timestamptz not null default now()+interval '7 days',created_at timestamptz not null default now()
);
create unique index pending_community_delivery on public.community_notification_invitations(community_id,recipient_id) where status='pending';
create table private.community_delivery_tokens(invitation_id uuid primary key references public.invitations on delete cascade,token text not null);
create table public.gaming_session_invitations (
 id uuid primary key default gen_random_uuid(),session_id uuid not null references public.gaming_sessions on delete cascade,
 sender_id uuid not null references auth.users on delete cascade,recipient_id uuid not null references auth.users on delete cascade,
 status text not null default 'pending' check(status in ('pending','accepted','declined')),
 expires_at timestamptz not null default now()+interval '7 days',created_at timestamptz not null default now()
);
create unique index pending_gaming_invitation on public.gaming_session_invitations(session_id,recipient_id) where status='pending';
create table public.moderator_notices (
 id uuid primary key,community_id uuid not null references public.communities on delete cascade,
 sender_id uuid not null references auth.users on delete cascade,recipient_id uuid not null references auth.users on delete cascade,
 body text not null check(length(btrim(body)) between 1 and 2000),created_at timestamptz not null default now()
);
create table public.notifications (
 id bigint generated always as identity primary key,
 recipient_id uuid not null references auth.users on delete cascade,
 actor_id uuid references auth.users on delete cascade,
 kind text not null check(kind in ('friend_requests','replies','mentions','community_invitations','event_reminders','event_updates','gaming_invitations','moderator_notices')),
 resource_type text not null check(resource_type in ('friend','channel','post','prayer','event','community_invite','squad_invite','notice')),
 resource_id uuid not null,dedupe_key text not null unique,
 read_at timestamptz,created_at timestamptz not null default now()
);
create index notifications_owner_page on public.notifications(recipient_id,id desc);
create index notifications_actor on public.notifications(actor_id,recipient_id);
create table private.space_budgets(user_id uuid references auth.users on delete cascade,operation text not null,started_at timestamptz not null default now(),attempts integer not null default 0,primary key(user_id,operation));
create table private.space_audit(id bigint generated always as identity primary key,community_id uuid references public.communities on delete cascade,actor_id uuid references auth.users on delete set null,resource_id uuid,action text not null,reason text not null default '' check(length(reason)<=300),created_at timestamptz not null default now());
-- Future providers may consume this private schema only after explicit consent and operator configuration.
-- No email/push delivery is scheduled or claimed by this phase.
create table private.notification_delivery_outbox(id bigint generated always as identity primary key,notification_id bigint not null references public.notifications on delete cascade,transport text not null check(transport in ('email','push')),status text not null default 'disabled' check(status in ('disabled','pending','sent','failed')),attempts integer not null default 0,next_attempt_at timestamptz,unique(notification_id,transport));

create function private.space_rank(u uuid,c uuid) returns integer language sql stable security definer set search_path='' as $$
 select coalesce((select r.rank from public.community_members m join public.community_roles r on r.id=m.role_id where m.user_id=u and m.community_id=c and m.status='active' and private.squad_live(u)),0);
$$;
create function private.prayer_allowed(u uuid,p uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.prayer_requests q where q.id=p and private.space_rank(u,q.community_id)>0 and private.squad_live(q.author_id) and not private.squad_blocked(u,q.author_id)
 and (u=q.author_id or private.space_rank(u,q.community_id)>=20 or (q.visibility='community' and q.status in ('open','answered'))));
$$;
create function public.prayer_access(p_prayer uuid) returns boolean language sql stable security definer set search_path='' as $$select private.prayer_allowed(auth.uid(),p_prayer);$$;
create function private.event_allowed(u uuid,e uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.events where id=e and private.space_rank(u,community_id)>0 and private.squad_live(host_id) and not private.squad_blocked(u,host_id));
$$;
create function public.event_access(p_event uuid) returns boolean language sql stable security definer set search_path='' as $$select private.event_allowed(auth.uid(),p_event);$$;
create function private.channel_user_allowed(u uuid,cid uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
declare c public.channels;r integer;rid text;begin
 select * into c from public.channels where id=cid;if not found then return false;end if;r:=private.space_rank(u,c.community_id);if r=0 then return false;end if;if r>=30 then return true;end if;
 select role_id into rid from public.community_members where user_id=u and community_id=c.community_id;
 if exists(select 1 from public.channel_permission_overrides where channel_id=cid and (user_id=u or role_id=rid) and not can_view) then return false;end if;
 return not c.is_private or exists(select 1 from public.channel_permission_overrides where channel_id=cid and (user_id=u or role_id=rid) and can_view);
end $$;
create function private.post_user_allowed(u uuid,pid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.squad_live(u) and exists(select 1 from public.posts p where p.id=pid and p.status='published' and (p.author_id is null or not private.squad_blocked(u,p.author_id)) and
 case p.audience when 'members' then true when 'community' then private.space_rank(u,p.community_id)>0 when 'private' then u=p.author_id else u=p.author_id or exists(select 1 from public.follows where follower_id=u and followed_id=p.author_id) end);
$$;
create function private.notification_resource(u uuid,t text,r uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
declare inv public.community_notification_invitations;gi public.gaming_session_invitations;s public.gaming_sessions;begin
 if not private.squad_live(u) then return false;end if;
 case t
 when 'friend' then return not private.squad_blocked(u,r) and private.squad_live(r) and exists(select 1 from public.friendships where low_id=least(u,r) and high_id=greatest(u,r));
 when 'prayer' then return private.prayer_allowed(u,r);
 when 'event' then return private.event_allowed(u,r);
 when 'channel' then return exists(select 1 from public.messages where id=r and deleted_at is null and private.channel_user_allowed(u,channel_id) and (author_id is null or not private.squad_blocked(u,author_id)));
 when 'post' then return private.post_user_allowed(u,r);
 when 'community_invite' then
  select * into inv from public.community_notification_invitations where id=r;return found and u=inv.recipient_id and inv.status='pending' and inv.expires_at>now() and not private.squad_blocked(u,inv.sender_id) and private.space_rank(inv.sender_id,inv.community_id)>=20 and not exists(select 1 from public.community_members where community_id=inv.community_id and user_id=u and status='banned');
 when 'squad_invite' then
  select * into gi from public.gaming_session_invitations where id=r;select * into s from public.gaming_sessions where id=gi.session_id;
  return gi.id is not null and s.id is not null and u=gi.recipient_id and gi.status='pending' and gi.expires_at>now() and s.status='open' and s.expires_at>now() and private.squad_eligible(u,s) and not private.squad_blocked(u,gi.sender_id);
 when 'notice' then return exists(select 1 from public.moderator_notices where id=r and recipient_id=u and private.space_rank(u,community_id)>0 and not private.squad_blocked(u,sender_id));
 else return false;end case;
end $$;
create function public.notification_access(p_id bigint) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.notifications n join public.notification_preferences pref on pref.user_id=n.recipient_id where n.id=p_id and n.recipient_id=auth.uid() and (n.actor_id is null or not private.squad_blocked(auth.uid(),n.actor_id)) and coalesce((to_jsonb(pref)->>n.kind)::boolean,false) and private.notification_resource(auth.uid(),n.resource_type,n.resource_id)
 and (n.kind not in ('event_reminders','event_updates') or exists(select 1 from public.event_rsvps where event_id=n.resource_id and user_id=auth.uid() and response='going'))
 and (n.kind<>'event_reminders' or exists(select 1 from public.events e join public.user_preferences up on up.user_id=auth.uid() where e.id=n.resource_id and up.event_reminders and e.status='scheduled' and e.starts_at>now() and n.dedupe_key like 'reminder:'||e.id::text||':'||e.revision::text||':%')));
$$;
create function private.emit_notification(u uuid,a uuid,k text,t text,r uuid,d text) returns void language plpgsql security definer set search_path='' as $$
begin
 if u is null or u=a or not private.squad_live(u) or (a is not null and (not private.squad_live(a) or private.squad_blocked(u,a))) or not private.notification_resource(u,t,r) or not exists(select 1 from public.notification_preferences p where user_id=u and coalesce((to_jsonb(p)->>k)::boolean,false)) then return;end if;
 insert into public.notifications(recipient_id,actor_id,kind,resource_type,resource_id,dedupe_key) values(u,a,k,t,r,d) on conflict(dedupe_key) do nothing;
 if found then perform realtime.send('{}'::jsonb,'changed','people:'||u::text,true);end if;
end $$;
create function private.bootstrap_notifications() returns trigger language plpgsql security definer set search_path='' as $$begin insert into public.notification_preferences(user_id) values(new.id) on conflict do nothing;return new;end $$;
create trigger notification_preferences_bootstrap after insert on auth.users for each row execute function private.bootstrap_notifications();
insert into public.notification_preferences(user_id,event_reminders) select user_id,event_reminders from public.user_preferences on conflict do nothing;

-- Every new data/operational table has RLS, including tables with no browser grants.
do $$declare t text;begin
 foreach t in array array['prayer_requests','prayer_comments','prayer_encouragements','events','event_rsvps','notification_preferences','community_notification_invitations','gaming_session_invitations','moderator_notices','notifications'] loop
 execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);end loop;
 foreach t in array array['community_delivery_tokens','space_budgets','space_audit','notification_delivery_outbox'] loop execute format('alter table private.%I enable row level security',t);execute format('revoke all on private.%I from public,anon,authenticated',t);end loop;
end $$;
grant select on public.prayer_requests,public.prayer_comments,public.prayer_encouragements,public.events,public.event_rsvps,public.notification_preferences,public.notifications to authenticated;
create policy prayer_read on public.prayer_requests for select to authenticated using(public.prayer_access(id));
create policy prayer_comment_read on public.prayer_comments for select to authenticated using(public.prayer_access(prayer_id));
-- Individual encouragement identities are private to their author; totals are authorized projections.
create policy prayer_encouragement_read on public.prayer_encouragements for select to authenticated using(user_id=auth.uid() and public.prayer_access(prayer_id));
create policy events_read on public.events for select to authenticated using(public.event_access(id));
create policy rsvp_read on public.event_rsvps for select to authenticated using(user_id=auth.uid() and public.event_access(event_id));
create policy notification_preferences_read on public.notification_preferences for select to authenticated using(user_id=auth.uid() and private.is_verified_member());
create policy notifications_read on public.notifications for select to authenticated using(public.notification_access(id));
-- Only current-user boolean policy helpers are executable by clients.
revoke all on function private.space_rank(uuid,uuid),private.prayer_allowed(uuid,uuid),private.event_allowed(uuid,uuid),private.channel_user_allowed(uuid,uuid),private.post_user_allowed(uuid,uuid),private.notification_resource(uuid,text,uuid),private.emit_notification(uuid,uuid,text,text,uuid,text),private.bootstrap_notifications() from public,anon,authenticated;
revoke all on function public.prayer_access(uuid),public.event_access(uuid),public.notification_access(bigint) from public,anon;
grant execute on function public.prayer_access(uuid),public.event_access(uuid),public.notification_access(bigint) to authenticated;
