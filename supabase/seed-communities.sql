-- Development only; opt-in and idempotent. Never resets existing settings/members.
begin;
insert into public.communities(id,slug,name,description,cover,visibility) values
 ('a4000000-0000-4000-8000-000000000001','the-gathering','The Gathering','The central community. Meet your people, find your next party, and make yourself at home.','nebula','public'),
 ('a4000000-0000-4000-8000-000000000002','co-op-adventures','Co-op Adventures','Good teammates, shared adventures, and a place for every skill level.','aurora','public'),
 ('a4000000-0000-4000-8000-000000000003','competitive-play','Competitive Play','Improve together, build a squad, and keep the competition kind.','ember','public'),
 ('a4000000-0000-4000-8000-000000000004','creative-worlds','Creative Worlds','A home for builders, explorers, and the worlds we make together.','ocean','public')
on conflict(slug) do nothing;
insert into public.channel_categories(id,community_id,name,position)
select ('b4000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,c.id,'Community',0
from (values(1,'the-gathering'),(2,'co-op-adventures'),(3,'competitive-play'),(4,'creative-worlds')) v(n,slug)
join public.communities c on c.slug=v.slug
on conflict do nothing;
insert into public.channels(community_id,category_id,name,description,kind,is_private,position)
select c.id,cat.id,v.name,v.description,v.kind,v.is_private,v.position
from public.communities c join public.channel_categories cat on cat.community_id=c.id and cat.name='Community'
cross join (values
 ('general','Make yourself at home.','text',false,0),
 ('introductions','Say hello to the community.','text',false,10),
 ('looking-for-group','Find your next party.','text',false,20),
 ('the-hangout','A space for good company. Voice transport is not connected.','voice',false,30),
 ('moderation','Private staff coordination.','text',true,40)
) v(name,description,kind,is_private,position)
where c.slug in ('the-gathering','co-op-adventures','competitive-play','creative-worlds')
on conflict(community_id,name) do nothing;
-- Preserve legacy central-channel links used by the retained screens.
insert into public.channels(community_id,category_id,name,description,kind,is_private,position)
select c.id,cat.id,v.name,v.description,'text',false,v.position
from public.communities c
join public.channel_categories cat on cat.community_id=c.id and cat.name='Community'
cross join (values
 ('gaming','Talk games and find good teammates.',11),
 ('prayer-requests','Share encouragement with care and respect for personal boundaries.',12),
 ('wins-and-highlights','Celebrate the little wins together.',13)
) v(name,description,position)
where c.slug='the-gathering'
on conflict(community_id,name) do nothing;
-- Moderators need an explicit grant to the seeded private staff channel.
-- Preserve any existing operator-authored override on repeat runs.
insert into public.channel_permission_overrides(community_id,channel_id,role_id,can_view,can_post,can_connect)
select c.community_id,c.id,'moderator',true,true,true from public.channels c
join public.communities co on co.id=c.community_id
where c.name='moderation' and co.slug in ('the-gathering','co-op-adventures','competitive-play','creative-worlds')
on conflict do nothing;
notify pgrst,'reload schema';
commit;
