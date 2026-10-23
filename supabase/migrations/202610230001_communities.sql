-- Phase 4: membership is authoritative, role definitions are immutable to clients.
create table public.community_roles (
 id text primary key check(id in ('owner','administrator','moderator','member')),
 rank integer not null unique
);
insert into public.community_roles values ('owner',40),('administrator',30),('moderator',20),('member',10);
create table private.community_creators (
 user_id uuid primary key references auth.users(id) on delete cascade,
 approved_at timestamptz not null default now()
);
alter table private.community_creators enable row level security;
revoke all on private.community_creators from public,anon,authenticated;
create table public.communities (
 id uuid primary key default gen_random_uuid(),
 slug text not null unique check(slug ~ '^[a-z][a-z0-9-]{2,47}$'),
 name text not null check(char_length(name) between 3 and 80),
 description text not null default '' check(char_length(description)<=2000),
 visibility text not null default 'public' check(visibility in ('public','discoverable','private')),
 cover text not null default 'nebula' check(cover in ('nebula','aurora','ember','ocean')),
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now()
);
create table public.community_members (
 community_id uuid not null references public.communities(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role_id text not null default 'member' references public.community_roles(id),
 status text not null default 'active' check(status in ('active','banned')),
 joined_at timestamptz not null default now(),
 primary key(community_id,user_id),
 check(status='active' or role_id='member')
);
create unique index community_one_owner on public.community_members(community_id) where role_id='owner';
create index community_members_user on public.community_members(user_id,community_id);
create table public.channel_categories (
 id uuid primary key default gen_random_uuid(),
 community_id uuid not null references public.communities(id) on delete cascade,
 name text not null check(char_length(name) between 1 and 60),
 position integer not null default 0 check(position between 0 and 999),
 unique(community_id,id)
);
create unique index category_unique_name on public.channel_categories(community_id,lower(name));
create table public.channels (
 id uuid primary key default gen_random_uuid(),
 community_id uuid not null references public.communities(id) on delete cascade,
 category_id uuid,
 name text not null check(name ~ '^[a-z0-9][a-z0-9-]{0,47}$'),
 description text not null default '' check(char_length(description)<=1000),
 kind text not null default 'text' check(kind in ('text','voice')),
 is_private boolean not null default false,
 position integer not null default 0 check(position between 0 and 999),
 unique(community_id,name), unique(community_id,id),
 foreign key(community_id,category_id) references public.channel_categories(community_id,id)
);
create index channels_order on public.channels(community_id,position,name);
create table public.channel_permission_overrides (
 id uuid primary key default gen_random_uuid(),
 community_id uuid not null,
 channel_id uuid not null,
 role_id text references public.community_roles(id),
 user_id uuid,
 can_view boolean not null,
 can_post boolean not null default true,
 can_connect boolean not null default true,
 foreign key(community_id,channel_id) references public.channels(community_id,id) on delete cascade,
 foreign key(community_id,user_id) references public.community_members(community_id,user_id) on delete cascade,
 check((role_id is null) <> (user_id is null))
);
create unique index override_role_unique on public.channel_permission_overrides(channel_id,role_id) where role_id is not null;
create unique index override_user_unique on public.channel_permission_overrides(channel_id,user_id) where user_id is not null;
create table public.invitations (
 id uuid primary key default gen_random_uuid(),
 community_id uuid not null references public.communities(id) on delete cascade,
 token_digest text not null unique check(token_digest ~ '^[a-f0-9]{64}$'),
 invited_by uuid references auth.users(id) on delete set null,
 expires_at timestamptz not null,
 accepted_by uuid references auth.users(id) on delete set null,
 accepted_at timestamptz,
 revoked_at timestamptz,
 created_at timestamptz not null default now()
);
create index invitations_community on public.invitations(community_id,created_at);
create table public.community_audit_log (
 id uuid primary key default gen_random_uuid(),
 community_id uuid references public.communities(id) on delete set null,
 actor_id uuid references auth.users(id) on delete set null,
 target_id uuid references auth.users(id) on delete set null,
 action text not null,
 detail jsonb not null default '{}',
 created_at timestamptz not null default now()
);
create index community_audit_order on public.community_audit_log(community_id,created_at desc);

-- Helpers never accept a caller-selected actor. Definer functions avoid recursive RLS.
create function private.community_rank(p_community uuid) returns integer
language sql stable security definer set search_path='' as $$
 select coalesce((select r.rank from public.community_members m join public.community_roles r on r.id=m.role_id
 where m.community_id=p_community and m.user_id=auth.uid() and m.status='active' and private.is_verified_member()),0);
$$;
create function public.community_access(p_community uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.is_verified_member() and exists(select 1 from public.communities c where c.id=p_community
 and (c.visibility<>'private' or private.community_rank(c.id)>0));
$$;
create function public.channel_access(p_channel uuid,p_permission text default 'view') returns boolean
language plpgsql stable security definer set search_path='' as $$
declare c public.channels; r integer; rid text; result boolean;
begin
 if p_permission not in ('view','post','connect') then return false; end if;
 select * into c from public.channels where id=p_channel;
 if not found then return false; end if;
 r:=private.community_rank(c.community_id);
 if r=0 then return false; end if;
 if r>=30 then return true; end if;
 select role_id into rid from public.community_members where community_id=c.community_id and user_id=auth.uid();
 -- Any matching explicit deny wins over any grant. All permissions require view.
 if exists(select 1 from public.channel_permission_overrides o where o.channel_id=c.id and (o.user_id=auth.uid() or o.role_id=rid)
 and (not o.can_view or (p_permission='post' and not o.can_post) or (p_permission='connect' and not o.can_connect))) then return false; end if;
 select bool_or(o.can_view) into result from public.channel_permission_overrides o
 where o.channel_id=c.id and (o.user_id=auth.uid() or o.role_id=rid);
 return not c.is_private or coalesce(result,false);
end $$;
create function public.can_create_community() returns boolean
language sql stable security definer set search_path='' as $$
 select private.is_verified_member() and exists(select 1 from private.community_creators where user_id=auth.uid());
$$;
create function public.community_my_role(p_community uuid) returns text
language sql stable security definer set search_path='' as $$
 select role_id from public.community_members where community_id=p_community and user_id=auth.uid() and status='active' and private.is_verified_member();
$$;

alter table public.community_roles enable row level security;
alter table public.communities enable row level security;
alter table public.community_members enable row level security;
alter table public.channel_categories enable row level security;
alter table public.channels enable row level security;
alter table public.channel_permission_overrides enable row level security;
alter table public.invitations enable row level security;
alter table public.community_audit_log enable row level security;
revoke all on public.community_roles,public.communities,public.community_members,public.channel_categories,public.channels,public.channel_permission_overrides,public.invitations,public.community_audit_log from public,anon,authenticated;
grant select on public.community_roles,public.communities,public.community_members,public.channel_categories,public.channels,public.channel_permission_overrides,public.community_audit_log to authenticated;
-- Token hashes are not exposed, even to community administrators.
grant select(id,community_id,invited_by,expires_at,accepted_by,accepted_at,revoked_at,created_at) on public.invitations to authenticated;
create policy community_roles_read on public.community_roles for select to authenticated using(private.is_verified_member());
create policy communities_read on public.communities for select to authenticated using(public.community_access(id));
create policy members_read on public.community_members for select to authenticated using(private.community_rank(community_id)>0);
create policy categories_read on public.channel_categories for select to authenticated using(private.community_rank(community_id)>0);
create policy channels_read on public.channels for select to authenticated using(public.channel_access(id));
create policy overrides_read on public.channel_permission_overrides for select to authenticated using(private.community_rank(community_id)>=30);
create policy invitations_read on public.invitations for select to authenticated using(private.community_rank(community_id)>=20);
create policy audit_read on public.community_audit_log for select to authenticated using(private.community_rank(community_id)>=20);
-- Policies call these zero-actor helpers; restricted table reads remain encapsulated.
grant usage on schema private to authenticated;
grant execute on function private.community_rank(uuid),private.is_verified_member() to authenticated;

create function private.audit_community_membership() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.community_audit_log(community_id,actor_id,target_id,action,detail)
 values((select id from public.communities where id=coalesce(new.community_id,old.community_id)),(select id from auth.users where id=auth.uid()),
 (select id from auth.users where id=coalesce(new.user_id,old.user_id)),
 'membership.'||lower(TG_OP),jsonb_build_object('old_role',old.role_id,'new_role',new.role_id,'old_status',old.status,'new_status',new.status));
 return coalesce(new,old);
end $$;
create trigger audit_community_membership after insert or update or delete on public.community_members for each row execute function private.audit_community_membership();

-- Single transactional command boundary. Every operation validates independently of UI.
create function public.community_command(p_operation text,p_community uuid default null,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); r integer; c public.communities; target uuid; target_rank integer;
 item uuid; cat uuid; token text; desired text; v_name text; v_description text; v_visibility text; v_cover text; ch public.channels; inv public.invitations;
begin
 if not private.is_verified_member() then raise exception 'Not authorized' using errcode='42501'; end if;
 if jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>12000 then raise exception 'Invalid input' using errcode='22023'; end if;
 if not private.take_limit('community:'||actor::text,100,900) then raise exception 'Please try later' using errcode='42501'; end if;
 if p_operation='create' then
  if not public.can_create_community() then raise exception 'Not authorized' using errcode='42501'; end if;
  if (select count(*) from public.communities where created_by=actor)>=20 then raise exception 'Creation limit reached' using errcode='42501'; end if;
  insert into public.communities(slug,name,description,visibility,cover,created_by)
  values(p_data->>'slug',p_data->>'name',coalesce(p_data->>'description',''),coalesce(p_data->>'visibility','public'),coalesce(p_data->>'cover','nebula'),actor) returning * into c;
  insert into public.community_members(community_id,user_id,role_id) values(c.id,actor,'owner');
  insert into public.channels(community_id,name) values(c.id,'general');
  return jsonb_build_object('id',c.id,'slug',c.slug);
 end if;
 if p_operation='accept_invite' then
  token:=p_data->>'token';
  if token is null or token !~ '^[a-f0-9]{64}$' then raise exception 'Invitation unavailable' using errcode='42501'; end if;
  -- Lock community before invitation/membership, consistent with all other commands.
  select community_id into p_community from public.invitations where token_digest=encode(sha256(convert_to(token,'UTF8')),'hex');
 end if;
 select * into c from public.communities where id=p_community for update;
 if not found then raise exception 'Not authorized' using errcode='42501'; end if;
 r:=private.community_rank(c.id);
 if p_operation='join' then
  if c.visibility<>'public' or exists(select 1 from public.community_members where community_id=c.id and user_id=actor and status='banned') then raise exception 'Not authorized' using errcode='42501'; end if;
  insert into public.community_members(community_id,user_id) values(c.id,actor) on conflict do nothing;
 elsif p_operation='leave' then
  if r=0 or r=40 then raise exception 'Transfer ownership before leaving' using errcode='42501'; end if;
  delete from public.community_members where community_id=c.id and user_id=actor;
 elsif p_operation='accept_invite' then
  select * into inv from public.invitations where community_id=c.id and token_digest=encode(sha256(convert_to(token,'UTF8')),'hex') for update;
  if not found or inv.expires_at<=now() or inv.revoked_at is not null or inv.accepted_at is not null
   or exists(select 1 from public.community_members where community_id=c.id and user_id=actor and status='banned') then raise exception 'Invitation unavailable' using errcode='42501'; end if;
  if exists(select 1 from public.community_members where community_id=c.id and user_id=actor) then raise exception 'Already a member' using errcode='22023'; end if;
  insert into public.community_members(community_id,user_id) values(c.id,actor);
  update public.invitations set accepted_by=actor,accepted_at=now() where id=inv.id;
 elsif p_operation='settings' then
  if r<30 then raise exception 'Not authorized' using errcode='42501'; end if;
  update public.communities set name=p_data->>'name',description=p_data->>'description',visibility=p_data->>'visibility',cover=p_data->>'cover' where id=c.id;
 elsif p_operation in ('role','transfer','ban','kick','unban') then
  target:=(p_data->>'user_id')::uuid;
  select cr.rank into target_rank from public.community_members m join public.community_roles cr on cr.id=m.role_id where m.community_id=c.id and m.user_id=target;
  if target_rank is null or target=actor or target_rank>=r then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_operation='transfer' then
   if r<>40 or not exists(select 1 from public.community_members where community_id=c.id and user_id=target and status='active') then raise exception 'Not authorized' using errcode='42501'; end if;
   update public.community_members set role_id='administrator' where community_id=c.id and user_id=actor;
   update public.community_members set role_id='owner' where community_id=c.id and user_id=target;
  elsif p_operation='role' then
   desired:=p_data->>'role';
   if r<30 or desired is null or desired not in ('administrator','moderator','member') or
    (select rank from public.community_roles where id=desired)>=r then raise exception 'Not authorized' using errcode='42501'; end if;
   update public.community_members set role_id=desired where community_id=c.id and user_id=target and status='active';
  else
   if r<20 then raise exception 'Not authorized' using errcode='42501'; end if;
   if p_operation='kick' then delete from public.community_members where community_id=c.id and user_id=target;
   else update public.community_members set status=case when p_operation='ban' then 'banned' else 'active' end,role_id='member' where community_id=c.id and user_id=target; end if;
  end if;
 elsif p_operation='category' then
  if r<30 then raise exception 'Not authorized' using errcode='42501'; end if;
  item:=nullif(p_data->>'id','')::uuid;
  if item is null then insert into public.channel_categories(community_id,name,position) values(c.id,p_data->>'name',(p_data->>'position')::integer);
  else update public.channel_categories set name=p_data->>'name',position=(p_data->>'position')::integer where community_id=c.id and id=item; if not found then raise exception 'Not authorized' using errcode='42501'; end if; end if;
 elsif p_operation='channel' then
  if r<30 then raise exception 'Not authorized' using errcode='42501'; end if;
  item:=nullif(p_data->>'id','')::uuid; cat:=nullif(p_data->>'category_id','')::uuid;
  if item is null then
   insert into public.channels(community_id,category_id,name,description,kind,is_private,position) values(c.id,cat,p_data->>'name',p_data->>'description',p_data->>'kind',(p_data->>'is_private')::boolean,(p_data->>'position')::integer);
  else
   update public.channels set category_id=cat,name=p_data->>'name',description=p_data->>'description',kind=p_data->>'kind',is_private=(p_data->>'is_private')::boolean,position=(p_data->>'position')::integer where community_id=c.id and id=item;
   if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  end if;
 elsif p_operation='override' then
  if r<30 then raise exception 'Not authorized' using errcode='42501'; end if;
  item:=(p_data->>'channel_id')::uuid;
  if not exists(select 1 from public.channels where community_id=c.id and id=item) then raise exception 'Not authorized' using errcode='42501'; end if;
  target:=nullif(p_data->>'user_id','')::uuid; desired:=nullif(p_data->>'role','');
  if (target is null)=(desired is null) then raise exception 'Choose one target' using errcode='22023'; end if;
  delete from public.channel_permission_overrides where channel_id=item and ((target is not null and user_id=target) or (desired is not null and role_id=desired));
  if not coalesce((p_data->>'reset')::boolean,false) then
   insert into public.channel_permission_overrides(community_id,channel_id,user_id,role_id,can_view,can_post,can_connect)
   values(c.id,item,target,desired,(p_data->>'can_view')::boolean,(p_data->>'can_post')::boolean,(p_data->>'can_connect')::boolean);
  end if;
 elsif p_operation='invite' then
  if r<20 then raise exception 'Not authorized' using errcode='42501'; end if;
  if (select count(*) from public.invitations where community_id=c.id and accepted_at is null and revoked_at is null and expires_at>now())>=100 then raise exception 'Invitation limit reached' using errcode='42501'; end if;
  insert into public.invitations(community_id,token_digest,invited_by,expires_at) values(c.id,p_data->>'token_digest',actor,now()+interval '7 days');
 elsif p_operation='revoke_invite' then
  if r<20 then raise exception 'Not authorized' using errcode='42501'; end if;
  update public.invitations set revoked_at=now() where id=(p_data->>'id')::uuid and community_id=c.id and accepted_at is null;
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
 else raise exception 'Unknown operation' using errcode='22023';
 end if;
 -- No tokens/digests in audit records. Membership trigger separately captures roles/statuses.
 insert into public.community_audit_log(community_id,actor_id,action,detail)
 values(c.id,actor,p_operation,jsonb_strip_nulls(jsonb_build_object('channel_id',case when p_operation in ('channel','override') then item end)));
 return jsonb_build_object('id',c.id,'slug',c.slug);
end $$;

-- Explicit roster projection, never a join that exposes private profiles/preferences.
create function public.community_roster(p_community uuid)
returns table(user_id uuid,username text,display_name text,role_id text,status text)
language sql stable security definer set search_path='' as $$
 select m.user_id,p.username,p.display_name,m.role_id,m.status from public.community_members m join public.profiles p on p.id=m.user_id
 where m.community_id=p_community and private.community_rank(p_community)>0
 and (m.status='active' or private.community_rank(p_community)>=20)
 order by m.joined_at,m.user_id limit 500;
$$;
-- Prevent function execution grants inherited from Supabase default privileges.
revoke all on function private.community_rank(uuid),private.audit_community_membership() from public,anon,authenticated;
grant execute on function private.community_rank(uuid) to authenticated;
revoke all on function public.community_access(uuid),public.channel_access(uuid,text),public.can_create_community(),public.community_my_role(uuid),public.community_command(text,uuid,jsonb),public.community_roster(uuid) from public,anon,authenticated;
grant execute on function public.community_access(uuid),public.channel_access(uuid,text),public.can_create_community(),public.community_my_role(uuid),public.community_command(text,uuid,jsonb),public.community_roster(uuid) to authenticated;
NOTIFY pgrst,'reload schema';
