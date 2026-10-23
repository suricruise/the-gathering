-- Legacy moderation remains functional while feeding one central action history.
create function private.central_content_audit() returns trigger language plpgsql security definer set search_path='' as $$declare cid uuid;tid uuid;why text;begin
 if tg_table_name='social_audit' then select community_id into cid from public.posts where id=new.post_id;tid:=coalesce(new.comment_id,new.post_id);why:='Reported social content review: '||left(new.action,100);
 elsif tg_table_name='message_moderation' then select c.community_id into cid from public.messages m join public.channels c on c.id=m.channel_id where m.id=new.message_id;tid:=new.message_id;why:='Channel message moderation: '||coalesce(nullif(new.reason,''),left(new.action,100));
 else cid:=new.community_id;tid:=new.resource_id;why:='Faith/event moderation: '||coalesce(nullif(new.reason,''),left(new.action,100));end if;
 insert into private.admin_audit(actor_id,community_id,target_id,action,reason,created_at) values(new.actor_id,cid,tid,'legacy.'||new.action,left(why,500),new.created_at);return new;end$$;
create trigger central_space_audit after insert on private.space_audit for each row execute function private.central_content_audit();
create trigger central_social_audit after insert on private.social_audit for each row execute function private.central_content_audit();
create trigger central_message_audit after insert on private.message_moderation for each row execute function private.central_content_audit();
-- Archived invitations cannot add members even when the bearer command omits its community argument.
create function private.archived_membership_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 if exists(select 1 from public.communities where id=new.community_id and archived) then raise exception 'Community archived' using errcode='42501';end if;return new;end$$;
create trigger archived_membership_guard before insert on public.community_members for each row execute function private.archived_membership_guard();
-- An operator may lodge a verified external appeal for a member unable to sign in.
-- It cannot restore access, assign roles or fabricate a member's authentication.
alter function public.admin_command(text,jsonb) rename to phase11_admin_command;
revoke all on function public.phase11_admin_command(text,jsonb) from public,anon,authenticated;
create function public.admin_command(p_operation text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$declare rid uuid;begin
 if p_operation is distinct from 'appeal_lodge' then return public.phase11_admin_command(p_operation,p_data);end if;
 perform pg_advisory_xact_lock(20261030);
 if private.platform_rank()<30 or jsonb_typeof(p_data)<>'object' or length(btrim(p_data->>'reason')) not between 5 and 500 or length(btrim(p_data->>'body')) not between 10 and 2000 or (p_data->>'user_id')::uuid=auth.uid() or not exists(select 1 from auth.users where id=(p_data->>'user_id')::uuid and email_confirmed_at is not null and deleted_at is null) then raise exception 'Not authorized' using errcode='42501';end if;
 insert into public.moderation_appeals(user_id,body) values((p_data->>'user_id')::uuid,p_data->>'body') returning id into rid;
 insert into private.admin_audit(actor_id,target_id,action,reason) values(auth.uid(),(p_data->>'user_id')::uuid,'appeal_lodge',p_data->>'reason');return jsonb_build_object('ok',true,'id',rid);end$$;
revoke all on function public.admin_command(text,jsonb),private.central_content_audit(),private.archived_membership_guard() from public,anon,authenticated;
grant execute on function public.admin_command(text,jsonb) to authenticated;
notify pgrst,'reload schema';

-- Import prior bounded operational history once, retaining original actor/time.
insert into private.admin_audit(actor_id,community_id,target_id,action,reason,created_at)
select h.actor_id,h.community_id,h.target_id,h.action,left(h.reason,500),h.created_at from (
 select actor_id,community_id,target_id,'community.'||action action,'Existing community control: '||left(action,100) reason,created_at from public.community_audit_log
 union all select a.actor_id,p.community_id,coalesce(a.comment_id,a.post_id),'legacy.'||a.action,'Reported social content review: '||left(a.action,100),a.created_at from private.social_audit a left join public.posts p on p.id=a.post_id
 union all select a.actor_id,c.community_id,a.message_id,'legacy.'||a.action,'Channel message moderation: '||coalesce(nullif(a.reason,''),left(a.action,100)),a.created_at from private.message_moderation a left join public.messages m on m.id=a.message_id left join public.channels c on c.id=m.channel_id
 union all select actor_id,community_id,resource_id,'legacy.'||action,'Faith/event moderation: '||coalesce(nullif(reason,''),left(action,100)),created_at from private.space_audit
) h where not exists(select 1 from private.admin_audit old where old.actor_id is not distinct from h.actor_id and old.community_id is not distinct from h.community_id and old.target_id is not distinct from h.target_id and old.action=h.action and old.created_at=h.created_at) order by h.created_at;
