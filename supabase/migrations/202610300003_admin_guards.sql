-- Policies bind function OIDs: explicitly repoint them after versioned wrappers.
do $$declare p record;expr text;chk text;begin
 for p in select pol.polname,n.nspname,c.relname,pg_get_expr(pol.polqual,pol.polrelid) qual,pg_get_expr(pol.polwithcheck,pol.polrelid) chk from pg_policy pol join pg_class c on c.oid=pol.polrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','storage','realtime') loop
 expr:=replace(replace(p.qual,'phase10_channel_access','channel_access'),'phase10_community_rank','community_rank');expr:=replace(expr,'phase10_community_access','community_access');
 chk:=replace(replace(p.chk,'phase10_channel_access','channel_access'),'phase10_community_rank','community_rank');chk:=replace(chk,'phase10_community_access','community_access');
 if expr is distinct from p.qual or chk is distinct from p.chk then execute format('alter policy %I on %I.%I%s%s',p.polname,p.nspname,p.relname,case when expr is null then '' else ' using ('||expr||')' end,case when chk is null then '' else ' with check ('||chk||')' end);end if;
 end loop;end$$;
alter function private.squad_eligible(uuid,public.gaming_sessions) rename to phase10_squad_eligible;
create function private.squad_eligible(p_user uuid,s public.gaming_sessions) returns boolean language sql stable security definer set search_path='' as $$select (s.community_id is null or exists(select 1 from public.communities where id=s.community_id and not archived)) and private.phase10_squad_eligible(p_user,s)$$;
revoke all on function private.squad_eligible(uuid,public.gaming_sessions),private.phase10_squad_eligible(uuid,public.gaming_sessions) from public,anon,authenticated;
-- Immutable, bounded evidence snapshots: no storage URLs, emails or conversation histories.
-- Historical reports are imported once; future inserts are captured transactionally.
insert into private.moderation_cases(reporter_id,community_id,target_type,target_id,subject_id,reason,evidence,retain_until,status)
select r.reporter_id,p.community_id,case when r.comment_id is null then 'post' else 'comment' end,coalesce(r.comment_id,r.post_id),coalesce(c.author_id,p.author_id),left(r.reason||': '||r.detail,1000),left(coalesce(c.body,p.body),5000),now()+interval '90 days',r.status from public.post_reports r join public.posts p on p.id=r.post_id left join public.post_comments c on c.id=r.comment_id on conflict do nothing;
insert into private.moderation_cases(reporter_id,target_type,target_id,subject_id,reason,evidence,retain_until,status)
select r.reporter_id,'dm',r.message_id,m.sender_id,r.reason,m.body,now()+interval '90 days',case when r.status in ('pending','reviewed') then 'open' else r.status end from public.direct_message_reports r join public.direct_messages m on m.id=r.message_id on conflict do nothing;
-- Include Phase 4 membership/settings actions and earlier moderation surfaces in central history.
create function private.central_community_audit() returns trigger language plpgsql security definer set search_path='' as $$begin
 insert into private.admin_audit(actor_id,community_id,target_id,action,reason) values(new.actor_id,new.community_id,new.target_id,'community.'||new.action,'Existing community control: '||left(new.action,100));return new;end$$;
create trigger central_community_audit after insert on public.community_audit_log for each row execute function private.central_community_audit();
-- Content removal may not target a community peer/superior through report review.
create function private.case_hierarchy_guard() returns trigger language plpgsql security definer set search_path='' as $$declare r integer;begin
 if new.status='actioned' and old.status is distinct from new.status and private.platform_rank()<20 and new.subject_id is not null then
 r:=coalesce((select cr.rank from public.community_members m join public.community_roles cr on cr.id=m.role_id where m.community_id=new.community_id and m.user_id=new.subject_id),0);
 if r>=private.admin_community_rank(new.community_id) then raise exception 'Cannot action a peer or superior' using errcode='42501';end if;end if;return new;end$$;
create trigger case_hierarchy_guard before update on private.moderation_cases for each row execute function private.case_hierarchy_guard();
revoke all on function private.central_community_audit(),private.case_hierarchy_guard() from public,anon,authenticated;
notify pgrst,'reload schema';
