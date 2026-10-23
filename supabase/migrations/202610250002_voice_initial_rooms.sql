-- Real room definitions only; do not invent users, occupancy, or connections.
insert into public.channels(community_id,category_id,name,description,kind,is_private,position)
select c.id,(select id from public.channel_categories where community_id=c.id order by position,id limit 1),v.name,v.description,'voice',false,v.position
from public.communities c cross join (values
 ('the-lounge','The central Gathering lounge. Come as you are and enjoy good company.',50),
 ('squad-up','Find a party and coordinate your next match.',60),
 ('minecraft-voice','Build, explore, and talk Minecraft together.',70),
 ('valorant-voice','Team comms for your next Valorant match.',80),
 ('rocket-league-voice','Find a teammate for the next kickoff.',90)
) v(name,description,position)
where c.slug='the-gathering'
on conflict(community_id,name) do nothing;
update public.channels set description='A space for good company. Live audio uses LiveKit.'
where kind='voice' and description='A space for good company. Voice transport is not connected.';
NOTIFY pgrst, 'reload schema';
