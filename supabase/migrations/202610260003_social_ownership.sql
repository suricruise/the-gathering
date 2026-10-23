-- Explicit ownership denials, own-comment deletion after access loss, irreversible removal.
create or replace function public.social_command(p_operation text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item uuid; target uuid; cmt uuid; p public.posts; cm public.post_comments; r public.post_reports; media_ids uuid[]; games text[]; interests text[]; txt text; aud text; comm uuid; v_emoji text; budget text; desired text; result uuid;
begin
 if not private.is_verified_member() then raise exception 'Not authorized' using errcode='42501'; end if;
 budget:=case when p_operation='create' then 'post' when p_operation='comment' then 'comment' when p_operation='react' then 'reaction' when p_operation='follow' then 'follow' when p_operation='report' then 'report' when p_operation='moderate' then 'moderate' else 'mutate' end;
 if not private.social_take(budget) then return jsonb_build_object('limited',true); end if;
 if p_operation='follow' then
  target:=(p_data->>'target')::uuid;
  if (p_data->>'active')::boolean=false then delete from public.follows where follower_id=actor and followed_id=target;return jsonb_build_object('ok',true);end if;
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
    if p.status='removed' and desired in ('restore','hide') then raise exception 'Removed content cannot be restored' using errcode='22023'; end if;
    update public.posts set status=case desired when 'hide' then 'hidden' when 'remove' then 'removed' else 'published' end,body=case when desired='remove' then '' else body end where id=p.id;
    if desired='remove' then update public.post_media set removed_at=now() where post_id=p.id;delete from public.post_link_previews where post_id=p.id; end if;
   else
    if desired in ('restore','hide') and exists(select 1 from public.post_comments where id=r.comment_id and status='removed') then raise exception 'Removed content cannot be restored' using errcode='22023'; end if;
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
 if p_operation='delete' then
  if p.author_id is distinct from actor then raise exception 'Not authorized' using errcode='42501'; end if;
  update public.posts set body='',status='removed',edited_at=now() where id=item;
  update public.post_media set removed_at=now() where post_id=item;
  delete from public.post_link_previews where post_id=item;
  return jsonb_build_object('id',item);
 end if;
 if p_operation='delete-comment' then
  cmt:=(p_data->>'comment')::uuid;
  update public.post_comments set body='',status='removed',edited_at=now() where id=cmt and post_id=item and author_id=actor;
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
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
  v_emoji:=p_data->>'emoji';if v_emoji not in ('👍','❤️','😂','🎉','🙏','🔥') or v_emoji is null then raise exception 'Invalid reaction' using errcode='22023'; end if;
  if (p_data->>'active')::boolean then insert into public.post_reactions values(item,actor,v_emoji) on conflict do nothing;else delete from public.post_reactions where post_id=item and user_id=actor and post_reactions.emoji=v_emoji;end if;
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


notify pgrst,'reload schema';
