-- Owner-requested one-time reset of existing account defaults.
-- Versioned installers must record this migration so later member choices survive reruns.
alter table public.profiles alter column visibility set default 'public';
alter table public.member_privacy alter column share_presence set default true;
alter table public.member_privacy alter column share_community_presence set default true;
update public.profiles set visibility='public' where visibility<>'public';
update public.member_privacy set share_presence=true,share_community_presence=true,last_seen=null,community_last_seen=null;
-- Presence still requires real authenticated heartbeats; do not fabricate online members.
