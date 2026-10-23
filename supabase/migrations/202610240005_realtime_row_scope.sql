-- Also scope the authorization-probe rows themselves to the requested topic.
-- Preserve unrelated Realtime policies without letting them widen chat access.
alter policy gathering_chat_receive on realtime.messages to authenticated
 using(extension='broadcast' and topic=(select realtime.topic()) and public.chat_topic_allowed((select realtime.topic())));
alter policy gathering_chat_receive_guard on realtime.messages to anon,authenticated
 using(coalesce((select realtime.topic()),'') not like 'chat:%' or
 (extension='broadcast' and topic=(select realtime.topic()) and public.chat_topic_allowed((select realtime.topic()))));
