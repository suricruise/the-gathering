-- Phase 7: real member posts. No fabricated authors or feed seed content.
create table public.posts (
 id uuid primary key, seq bigint generated always as identity unique,
 author_id uuid references auth.users(id) on delete set null,
 community_id uuid references public.communities(id) on delete cascade,
 audience text not null check(audience in ('members','followers','community','private')),
 body text not null default '' check(char_length(body)<=5000),
 game_tags text[] not null default '{}' check(cardinality(game_tags)<=4),
 interest_tags text[] not null default '{}' check(cardinality(interest_tags)<=4 and interest_tags <@ array['casual','competitive','co-op','creative','faith','conversation','events','streaming']::text[]),
 status text not null default 'published' check(status in ('published','hidden','removed')),
 created_at timestamptz not null default clock_timestamp(), edited_at timestamptz,
 check((audience='community')=(community_id is not null))
);
create index posts_feed on public.posts(seq desc);
create index posts_community_feed on public.posts(community_id,seq desc);
create index posts_author_feed on public.posts(author_id,seq desc);
create index posts_game_tags on public.posts using gin(game_tags);
create index posts_interest_tags on public.posts using gin(interest_tags);
create table public.post_media (
 id uuid primary key, author_id uuid references auth.users(id) on delete set null,
 post_id uuid references public.posts(id) on delete cascade,
 storage_path text not null unique, filename text not null check(char_length(filename) between 1 and 120),
 mime text not null check(mime in ('image/webp','video/mp4')),
 kind text not null check(kind in ('photo','gif','video')),
 byte_size integer not null check(byte_size between 1 and 3145728),
 rights_attested boolean not null default false, created_at timestamptz not null default now(), removed_at timestamptz,
 check(kind<>'video' or rights_attested), check((kind='video')=(mime='video/mp4'))
);
create index post_media_post on public.post_media(post_id);
create index post_media_owner on public.post_media(author_id,created_at);
create table public.post_reactions (
 post_id uuid not null references public.posts(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 emoji text not null check(emoji in ('👍','❤️','😂','🎉','🙏','🔥')),
 primary key(post_id,user_id,emoji)
);
create table public.post_comments (
 id uuid primary key, seq bigint generated always as identity unique,
 post_id uuid not null references public.posts(id) on delete cascade,
 author_id uuid references auth.users(id) on delete set null,
 body text not null check(char_length(body)<=2000),
 status text not null default 'published' check(status in ('published','hidden','removed')),
 created_at timestamptz not null default clock_timestamp(), edited_at timestamptz,
 unique(post_id,id)
);
create index post_comments_page on public.post_comments(post_id,seq desc);
create index post_comments_author on public.post_comments(author_id);
create table public.follows (
 follower_id uuid not null references auth.users(id) on delete cascade,
 followed_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(follower_id,followed_id),check(follower_id<>followed_id)
);
create index follows_followed on public.follows(followed_id);
create table public.post_reports (
 id uuid primary key default gen_random_uuid(), reporter_id uuid references auth.users(id) on delete set null,
 post_id uuid not null references public.posts(id) on delete cascade, comment_id uuid,
 reason text not null check(reason in ('harassment','hate','sexual','violence','spam','privacy','other')),
 detail text not null default '' check(char_length(detail)<=500),
 status text not null default 'open' check(status in ('open','dismissed','actioned')),
 created_at timestamptz not null default now(), reviewed_at timestamptz,
 foreign key(post_id,comment_id) references public.post_comments(post_id,id) on delete cascade
);
create unique index report_one_post on public.post_reports(reporter_id,post_id) where comment_id is null;
create unique index report_one_comment on public.post_reports(reporter_id,comment_id) where comment_id is not null;
create index reports_queue on public.post_reports(status,created_at);
create table public.post_link_previews (
 post_id uuid not null references public.posts(id) on delete cascade,
 url text not null check(char_length(url)<=2048), title text not null check(char_length(title)<=160),
 description text not null check(char_length(description)<=300), hostname text not null check(char_length(hostname)<=253),
 primary key(post_id,url)
);
create table private.social_moderators(user_id uuid primary key references auth.users(id) on delete cascade);
create table private.social_budgets(user_id uuid references auth.users(id) on delete cascade, operation text not null, minute timestamptz not null, attempts integer not null, primary key(user_id,operation,minute));
create table private.social_audit(id bigint generated always as identity primary key, actor_id uuid references auth.users(id) on delete set null, post_id uuid references public.posts(id) on delete set null, comment_id uuid references public.post_comments(id) on delete set null, action text not null, created_at timestamptz not null default now());
alter table private.social_moderators enable row level security;
alter table private.social_budgets enable row level security;
alter table private.social_audit enable row level security;
revoke all on private.social_moderators,private.social_budgets,private.social_audit from public,anon,authenticated;

create function private.social_staff(p_post uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_verified_member() and exists(select 1 from public.posts p where p.id=p_post and
 case when p.community_id is not null then private.community_rank(p.community_id)>=20
 else p.audience<>'private' and exists(select 1 from private.social_moderators where user_id=auth.uid()) end);
$$;
create function public.post_access(p_post uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_verified_member() and exists(select 1 from public.posts p where p.id=p_post and
 (case p.audience when 'community' then private.community_rank(p.community_id)>0
 when 'members' then true when 'private' then p.author_id=auth.uid()
 else p.author_id=auth.uid() or private.social_staff(p.id) or exists(select 1 from public.follows where follower_id=auth.uid() and followed_id=p.author_id) end)
 and (p.status='published' or p.author_id=auth.uid() or private.social_staff(p.id)));
$$;
create function private.social_take(p_operation text,p_http boolean default false) returns boolean language plpgsql security definer set search_path='' as $$
declare n integer; maximum integer;
begin
 if not private.is_verified_member() then return false; end if;
 maximum:=case p_operation when 'post' then 6 when 'comment' then 20 when 'reaction' then 60 when 'follow' then 30 when 'report' then 10 when 'preview' then 10 when 'upload' then 10 when 'mutate' then 30 when 'moderate' then 30 else 0 end;
 if maximum=0 then return false; end if;
 insert into private.social_budgets values(auth.uid(),case when p_http then 'http:' else 'rpc:' end||p_operation,date_trunc('minute',now()),1)
 on conflict(user_id,operation,minute) do update set attempts=private.social_budgets.attempts+1 returning attempts into n;
 delete from private.social_budgets where minute<now()-interval '1 day';
 return n<=maximum;
end $$;
create function public.social_budget(p_operation text) returns boolean language sql security definer set search_path='' as $$ select private.social_take(p_operation,true) $$;

alter table public.posts enable row level security;
alter table public.post_media enable row level security;
alter table public.post_reactions enable row level security;
alter table public.post_comments enable row level security;
alter table public.follows enable row level security;
alter table public.post_reports enable row level security;
alter table public.post_link_previews enable row level security;
revoke all on public.posts,public.post_media,public.post_reactions,public.post_comments,public.follows,public.post_reports,public.post_link_previews from public,anon,authenticated;
grant select on public.posts,public.post_reactions,public.post_comments,public.follows,public.post_reports,public.post_link_previews to authenticated;
grant select(id,author_id,post_id,filename,mime,kind,byte_size,rights_attested,created_at,removed_at) on public.post_media to authenticated;
create policy posts_read on public.posts for select to authenticated using(public.post_access(id));
create policy post_media_read on public.post_media for select to authenticated using(removed_at is null and private.is_verified_member() and ((post_id is null and author_id=auth.uid()) or public.post_access(post_id)));
create policy post_reactions_read on public.post_reactions for select to authenticated using(public.post_access(post_id));
create policy post_comments_read on public.post_comments for select to authenticated using(public.post_access(post_id) and (status='published' or author_id=auth.uid() or private.social_staff(post_id)));
create policy follows_read on public.follows for select to authenticated using(private.is_verified_member() and follower_id=auth.uid());
create policy post_reports_read on public.post_reports for select to authenticated using(private.is_verified_member() and (reporter_id=auth.uid() or private.social_staff(post_id)));
create policy post_previews_read on public.post_link_previews for select to authenticated using(public.post_access(post_id));

create function private.social_dto(p public.posts) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',p.id,'seq',p.seq::text,'author_id',p.author_id,'author_name',coalesce(nullif(pr.display_name,''),'Former member'),
 'username',case when pr.visibility<>'private' then pr.username else null end,'avatar',public.visible_avatar(p.author_id) is not null,
 'body',p.body,'audience',p.audience,'community_id',p.community_id,'community_name',c.name,'community_slug',c.slug,'game_tags',p.game_tags,'interest_tags',p.interest_tags,
 'status',p.status,'created_at',p.created_at,'edited_at',p.edited_at,'can_moderate',private.social_staff(p.id),
 'following',exists(select 1 from public.follows where follower_id=auth.uid() and followed_id=p.author_id),
 'media',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'filename',m.filename,'kind',m.kind,'mime',m.mime,'byte_size',m.byte_size) order by m.created_at,m.id) from public.post_media m where m.post_id=p.id and m.removed_at is null),'[]'),
 'reactions',coalesce((select jsonb_agg(jsonb_build_object('emoji',x.emoji,'count',x.n,'mine',x.mine) order by x.emoji) from (select emoji,count(*) n,bool_or(user_id=auth.uid()) mine from public.post_reactions where post_id=p.id group by emoji)x),'[]'),
 'comment_count',(select count(*) from public.post_comments where post_id=p.id and status='published'),
 'previews',coalesce((select jsonb_agg(jsonb_build_object('url',url,'title',title,'description',description,'hostname',hostname)) from public.post_link_previews where post_id=p.id),'[]'))
 from (select 1)dummy left join public.profiles pr on pr.id=p.author_id left join public.communities c on c.id=p.community_id;
$$;
create function public.social_feed(p_mode text default 'for-you',p_community uuid default null,p_interest text default null,p_author uuid default null,p_before bigint default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare rows jsonb; next_cursor text;
begin
 if not private.is_verified_member() then raise exception 'Not authorized' using errcode='42501'; end if;
 if p_mode not in ('for-you','explore','following','mine') or (p_before is not null and p_before<1) or (p_interest is not null and p_interest not in ('casual','competitive','co-op','creative','faith','conversation','events','streaming')) then raise exception 'Invalid filters' using errcode='22023'; end if;
 select coalesce(jsonb_agg(private.social_dto(x) order by x.seq desc),'[]'),min(x.seq)::text into rows,next_cursor from (
 select p.* from public.posts p where public.post_access(p.id) and p.status<>'removed' and (p_before is null or p.seq<p_before)
 and (p_community is null or p.community_id=p_community) and (p_interest is null or p_interest=any(p.interest_tags)) and (p_author is null or p.author_id=p_author)
 and (p_mode='explore' or (p_mode='mine' and p.author_id=auth.uid()) or (p_mode='following' and exists(select 1 from public.follows where follower_id=auth.uid() and followed_id=p.author_id))
 or (p_mode='for-you' and (p.author_id=auth.uid() or exists(select 1 from public.follows where follower_id=auth.uid() and followed_id=p.author_id) or private.community_rank(p.community_id)>0 or p.interest_tags && coalesce((select interests from public.user_preferences where user_id=auth.uid()),'{}') or p.game_tags && array(select game_id from public.user_games where user_id=auth.uid()))))
 order by p.seq desc limit 20) x;
 return jsonb_build_object('items',rows,'next',case when jsonb_array_length(rows)=20 then next_cursor else null end);
end $$;
create function public.social_post(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$ select private.social_dto(p) from public.posts p where p.id=p_id and public.post_access(p.id) $$;
create function public.social_comments(p_post uuid,p_before bigint default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare items jsonb; next_cursor text;
begin
 if not public.post_access(p_post) then raise exception 'Not authorized' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'seq',x.seq::text,'post_id',x.post_id,'author_id',x.author_id,'author_name',coalesce(nullif(pr.display_name,''),'Former member'),'avatar',public.visible_avatar(x.author_id) is not null,'body',x.body,'status',x.status,'created_at',x.created_at,'edited_at',x.edited_at) order by x.seq desc),'[]'),min(x.seq)::text into items,next_cursor
 from (select * from public.post_comments where post_id=p_post and (p_before is null or seq<p_before) and (status='published' or author_id=auth.uid() or private.social_staff(p_post)) order by seq desc limit 20)x left join public.profiles pr on pr.id=x.author_id;
 return jsonb_build_object('items',items,'next',case when jsonb_array_length(items)=20 then next_cursor else null end);
end $$;

create function public.social_command(p_operation text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item uuid; target uuid; cmt uuid; p public.posts; cm public.post_comments; r public.post_reports; media_ids uuid[]; games text[]; interests text[]; txt text; aud text; comm uuid; emoji text; budget text; desired text; result uuid;
begin
 if not private.is_verified_member() then raise exception 'Not authorized' using errcode='42501'; end if;
 budget:=case when p_operation='create' then 'post' when p_operation='comment' then 'comment' when p_operation='react' then 'reaction' when p_operation='follow' then 'follow' when p_operation='report' then 'report' when p_operation='moderate' then 'moderate' else 'mutate' end;
 if not private.social_take(budget) then return jsonb_build_object('limited',true); end if;
 if p_operation='follow' then
  target:=(p_data->>'target')::uuid;
  if target=actor or not exists(select 1 from auth.users u join private.account_security s on s.user_id=u.id where u.id=target and u.email_confirmed_at is not null and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now())) then raise exception 'Member unavailable' using errcode='42501'; end if;
  -- Following is possible only from accessible content or a visible profile, not an identity directory.
  if not exists(select 1 from public.posts po where po.author_id=target and public.post_access(po.id)) and not exists(select 1 from public.profiles pr where pr.id=target and pr.visibility<>'private' and pr.onboarding_completed_at is not null) then raise exception 'Member unavailable' using errcode='42501'; end if;
  if (p_data->>'active')::boolean then insert into public.follows values(actor,target,now()) on conflict do nothing; else delete from public.follows where follower_id=actor and followed_id=target; end if;
  return jsonb_build_object('ok',true);
 end if;
 if p_operation='create' then
  item:=(p_data->>'id')::uuid; perform pg_advisory_xact_lock(hashtextextended(item::text,717));
  select * into p from public.posts where id=item;
  if found then if p.author_id<>actor or p.author_id is null then raise exception 'Not authorized' using errcode='42501'; end if; return jsonb_build_object('id',p.id); end if;
  txt:=coalesce(p_data->>'body','');aud:=p_data->>'audience';comm:=nullif(p_data->>'community','')::uuid;
  games:=array(select distinct jsonb_array_elements_text(coalesce(p_data->'games','[]')));interests:=array(select distinct jsonb_array_elements_text(coalesce(p_data->'interests','[]')));
  media_ids:=array(select value::uuid from jsonb_array_elements_text(coalesce(p_data->'media','[]'))t(value));
  if char_length(txt)>5000 or txt ~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]' or aud not in ('members','followers','community','private') or aud is null or ((aud='community')<>(comm is not null)) or cardinality(games)>4 or exists(select 1 from unnest(games)g where not exists(select 1 from public.games where id=g)) or cardinality(media_ids)>4 or cardinality(media_ids)<>(select count(distinct x) from unnest(media_ids)x) or (btrim(txt)='' and cardinality(media_ids)=0) then raise exception 'Invalid post' using errcode='22023'; end if;
  if comm is not null and private.community_rank(comm)=0 then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from public.post_media where id=any(media_ids) order by id for update;
  if (select count(*) from public.post_media where id=any(media_ids) and author_id=actor and post_id is null and removed_at is null and created_at>now()-interval '24 hours')<>cardinality(media_ids) then raise exception 'Media unavailable' using errcode='42501'; end if;
  insert into public.posts(id,author_id,community_id,audience,body,game_tags,interest_tags) values(item,actor,comm,aud,txt,games,interests);
  update public.post_media set post_id=item where id=any(media_ids);
  return jsonb_build_object('id',item);
 end if;
 if p_operation='moderate' then
  select * into r from public.post_reports where id=(p_data->>'report')::uuid for update;
  if not found or not private.social_staff(r.post_id) then raise exception 'Not authorized' using errcode='42501'; end if;
  select * into p from public.posts where id=r.post_id for update;
  desired:=p_data->>'decision';
  if desired not in ('dismiss','hide','remove','restore') then raise exception 'Invalid decision' using errcode='22023'; end if;
  if desired<>'dismiss' then
   target:=p.author_id;
   if r.comment_id is not null then select author_id into target from public.post_comments where id=r.comment_id; end if;
   if p.community_id is not null and target<>actor and (select coalesce(rank,0) from public.community_roles cr join public.community_members m on m.role_id=cr.id where m.community_id=p.community_id and m.user_id=target)>=private.community_rank(p.community_id) then raise exception 'Not authorized' using errcode='42501'; end if;
   if r.comment_id is null then
    if p.status='removed' and desired='restore' then raise exception 'Removed content cannot be restored' using errcode='22023'; end if;
    update public.posts set status=case desired when 'hide' then 'hidden' when 'remove' then 'removed' else 'published' end,body=case when desired='remove' then '' else body end where id=p.id;
    if desired='remove' then update public.post_media set removed_at=now() where post_id=p.id;delete from public.post_link_previews where post_id=p.id; end if;
   else
    if desired='restore' and exists(select 1 from public.post_comments where id=r.comment_id and status='removed') then raise exception 'Removed content cannot be restored' using errcode='22023'; end if;
    update public.post_comments set status=case desired when 'hide' then 'hidden' when 'remove' then 'removed' else 'published' end,body=case when desired='remove' then '' else body end where id=r.comment_id;
   end if;
  end if;
  update public.post_reports set status=case when desired='dismiss' then 'dismissed' else 'actioned' end,reviewed_at=now() where id=r.id;
  insert into private.social_audit(actor_id,post_id,comment_id,action) values(actor,p.id,r.comment_id,desired);
  return jsonb_build_object('id',p.id);
 end if;
 item:=(p_data->>'post')::uuid;
 select * into p from public.posts where id=item for update;
 if not found then raise exception 'Post unavailable' using errcode='42501'; end if;
 if p_operation='delete' and p.author_id=actor then
  update public.posts set body='',status='removed',edited_at=now() where id=item;
  update public.post_media set removed_at=now() where post_id=item;
  delete from public.post_link_previews where post_id=item;
  return jsonb_build_object('id',item);
 end if;
 if not public.post_access(item) or p.status='removed' then raise exception 'Post unavailable' using errcode='42501'; end if;
 if p_operation='edit' then
  txt:=p_data->>'body';
  if p.author_id<>actor or p.status<>'published' then raise exception 'Not authorized' using errcode='42501'; end if;
  if txt is null or char_length(txt)>5000 or txt ~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]' or (btrim(txt)='' and not exists(select 1 from public.post_media where post_id=item and removed_at is null)) then raise exception 'Invalid text' using errcode='22023'; end if;
  update public.posts set body=txt,edited_at=now() where id=item;delete from public.post_link_previews where post_id=item;
 elsif p_operation='react' then
  if p.status<>'published' then raise exception 'Not authorized' using errcode='42501'; end if;
  emoji:=p_data->>'emoji';if emoji not in ('👍','❤️','😂','🎉','🙏','🔥') or emoji is null then raise exception 'Invalid reaction' using errcode='22023'; end if;
  if (p_data->>'active')::boolean then insert into public.post_reactions values(item,actor,emoji) on conflict do nothing;else delete from public.post_reactions where post_id=item and user_id=actor and post_reactions.emoji=emoji;end if;
 elsif p_operation='comment' then
  if p.status<>'published' then raise exception 'Not authorized' using errcode='42501'; end if;
  cmt:=(p_data->>'id')::uuid;txt:=p_data->>'body';
  if txt is null or btrim(txt)='' or char_length(txt)>2000 or txt ~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]' then raise exception 'Invalid comment' using errcode='22023'; end if;
  select * into cm from public.post_comments where id=cmt;
  if found then if cm.author_id<>actor or cm.post_id<>item then raise exception 'Not authorized' using errcode='42501'; end if;
  else insert into public.post_comments(id,post_id,author_id,body) values(cmt,item,actor,txt);end if;
 elsif p_operation in ('edit-comment','delete-comment') then
  cmt:=(p_data->>'comment')::uuid;select * into cm from public.post_comments where id=cmt and post_id=item for update;
  if not found or cm.author_id<>actor then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_operation='edit-comment' then
   txt:=p_data->>'body';if cm.status<>'published' or txt is null or btrim(txt)='' or char_length(txt)>2000 or txt ~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]' then raise exception 'Invalid comment' using errcode='22023'; end if;
   update public.post_comments set body=txt,edited_at=now() where id=cmt;
  else update public.post_comments set body='',status='removed',edited_at=now() where id=cmt;end if;
 elsif p_operation='report' then
  cmt:=nullif(p_data->>'comment','')::uuid;
  if (cmt is null and p.author_id=actor) or (cmt is not null and not exists(select 1 from public.post_comments where id=cmt and post_id=item and author_id<>actor and status='published')) then raise exception 'Content unavailable' using errcode='42501'; end if;
  insert into public.post_reports(reporter_id,post_id,comment_id,reason,detail) values(actor,item,cmt,p_data->>'reason',coalesce(p_data->>'detail','')) on conflict do nothing;
 else raise exception 'Unknown operation' using errcode='22023'; end if;
 return jsonb_build_object('id',item);
end $$;

create function public.social_report_page(p_before timestamptz default null,p_mine boolean default false) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'post_id',r.post_id,'comment_id',r.comment_id,'reason',r.reason,'detail',r.detail,'status',r.status,'created_at',r.created_at,'can_moderate',private.social_staff(r.post_id),'post',case when public.post_access(r.post_id) then private.social_dto(p) else null end,'comment_body',case when private.social_staff(r.post_id) then cm.body else null end) order by r.created_at desc),'[]')
 from (select * from public.post_reports where private.is_verified_member() and (case when p_mine then reporter_id=auth.uid() else private.social_staff(post_id) end) and (p_before is null or created_at<p_before) order by created_at desc,id desc limit 30)r join public.posts p on p.id=r.post_id left join public.post_comments cm on cm.id=r.comment_id;
$$;
-- No public or ordinary direct Storage access, even if unrelated policies are broad.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('social-media','social-media',false,3145728,array['image/webp','video/mp4']);
create policy social_objects_server_only on storage.objects as restrictive for all to anon,authenticated using(bucket_id<>'social-media') with check(bucket_id<>'social-media');
create policy social_bucket_server_only on storage.buckets as restrictive for all to anon,authenticated using(id<>'social-media') with check(id<>'social-media');

create function public.register_post_media(p_id uuid,p_path text,p_filename text,p_mime text,p_kind text,p_size integer,p_rights boolean) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if not private.is_verified_member() or p_path<>auth.uid()::text||'/'||p_id::text or not exists(select 1 from storage.objects where bucket_id='social-media' and name=p_path) or not private.social_take('upload') then return false; end if;
 insert into public.post_media(id,author_id,storage_path,filename,mime,kind,byte_size,rights_attested) values(p_id,auth.uid(),p_path,p_filename,p_mime,p_kind,p_size,p_rights);
 return true;
end $$;
create function public.store_post_preview(p_post uuid,p_body text,p_url text,p_title text,p_description text,p_hostname text) returns boolean language plpgsql security definer set search_path='' as $$
declare p public.posts;
begin
 select * into p from public.posts where id=p_post for update;
 if not found or p.status<>'published' or p.body<>p_body or position(p_url in p.body)=0 then return false; end if;
 insert into public.post_link_previews values(p_post,p_url,p_title,p_description,p_hostname) on conflict(post_id,url) do update set title=excluded.title,description=excluded.description,hostname=excluded.hostname;
 return true;
end $$;
create function public.social_cleanup_files(p_user uuid default null,p_limit integer default 500) returns table(id uuid,storage_path text) language plpgsql security definer set search_path='' as $$
declare selected uuid[];
begin
 select array_agg(x.id) into selected from (select m.id from public.post_media m join storage.objects o on o.bucket_id='social-media' and o.name=m.storage_path
 where (case when p_user is not null then m.author_id=p_user else m.removed_at is not null or (m.post_id is null and m.created_at<now()-interval '24 hours') end)
 order by m.created_at,m.id limit least(greatest(p_limit,1),500) for update of m skip locked)x;
 update public.post_media m set removed_at=coalesce(m.removed_at,now()) where m.id=any(selected);
 return query select m.id,m.storage_path from public.post_media m where m.id=any(selected)
 union all select o.id,o.name from storage.objects o where o.bucket_id='social-media' and not exists(select 1 from public.post_media m where m.storage_path=o.name)
 and (case when p_user is not null then split_part(o.name,'/',1)=p_user::text else o.created_at<now()-interval '24 hours' end) limit least(greatest(p_limit,1),500);
end $$;
create function public.social_files_removed(p_ids uuid[]) returns boolean language plpgsql security definer set search_path='' as $$ begin delete from public.post_media where id=any(p_ids) and removed_at is not null;return true;end $$;
create function private.social_account_deleted() returns trigger language plpgsql security definer set search_path='' as $$ begin
 update public.posts set body='',status='removed' where author_id=old.id;
 update public.post_comments set body='',status='removed' where author_id=old.id;
 update public.post_media set removed_at=now() where author_id=old.id;
 delete from public.post_link_previews where post_id in(select id from public.posts where author_id=old.id);
 return old;
end $$;
create trigger social_account_deleted before delete on auth.users for each row execute function private.social_account_deleted();
revoke all on function private.social_staff(uuid),private.social_take(text,boolean),private.social_dto(public.posts),private.social_account_deleted(),public.post_access(uuid),public.social_budget(text),public.social_feed(text,uuid,text,uuid,bigint),public.social_post(uuid),public.social_comments(uuid,bigint),public.social_command(text,jsonb),public.social_report_page(timestamptz,boolean),public.register_post_media(uuid,text,text,text,text,integer,boolean),public.store_post_preview(uuid,text,text,text,text,text),public.social_cleanup_files(uuid,integer),public.social_files_removed(uuid[]) from public,anon,authenticated;
grant execute on function public.post_access(uuid),public.social_budget(text),public.social_feed(text,uuid,text,uuid,bigint),public.social_post(uuid),public.social_comments(uuid,bigint),public.social_command(text,jsonb),public.social_report_page(timestamptz,boolean),public.register_post_media(uuid,text,text,text,text,integer,boolean) to authenticated;
grant execute on function public.store_post_preview(uuid,text,text,text,text,text),public.social_cleanup_files(uuid,integer),public.social_files_removed(uuid[]) to service_role;
notify pgrst,'reload schema';
