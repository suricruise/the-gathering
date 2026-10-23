-- Server-only preview storage and bounded upload admission.
create function public.store_message_preview(p_message uuid,p_url text,p_title text,p_description text,p_hostname text) returns boolean
language plpgsql security definer set search_path='' as $$
declare m public.messages;
begin
 select * into m from public.messages where id=p_message;
 if not found then return false; end if;
 perform 1 from public.communities c join public.channels ch on ch.community_id=c.id where ch.id=m.channel_id for key share of c;
 perform 1 from public.channels where id=m.channel_id for update;
 select * into m from public.messages where id=p_message for update;
 if m.deleted_at is not null or position(p_url in m.body)=0 then return false; end if;
 if p_url !~ '^https://' then return false; end if;
 insert into public.message_link_previews(message_id,url,title,description,hostname) values(p_message,p_url,p_title,p_description,p_hostname) on conflict do nothing;
 update public.messages set version=version where id=p_message;
 return true;
end $$;
revoke all on function public.store_message_preview(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.store_message_preview(uuid,text,text,text,text) to service_role;
create function public.chat_upload_budget(p_channel uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 perform private.chat_require(p_channel,'post');
 return private.take_limit('chat-upload-admit:'||auth.uid()::text,10,60);
end $$;
revoke all on function public.chat_upload_budget(uuid) from public,anon,authenticated;
grant execute on function public.chat_upload_budget(uuid) to authenticated;
notify pgrst,'reload schema';
