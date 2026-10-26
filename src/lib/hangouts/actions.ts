'use server';
import {createClient} from '../supabase/server';
import {roomService} from '../voice/server';
import {z} from 'zod';
import {roomType,matchesInterest,type HangoutData,type HangoutRoom} from './model';
export async function hangoutDirectory():Promise<{data?:HangoutData;error?:string;denied?:boolean}>{
 try{
 const client=await createClient();const auth=await client.auth.getUser();if(auth.error||!auth.data.user?.email_confirmed_at)return{error:'Sign in to explore Hangouts.',denied:true};
 const budget=await client.rpc('space_budget',{p_operation:'request'});if(budget.error||budget.data!==true)return{error:'Hangouts are unavailable. Please retry later.'};
 const [channels,joined,prefs]=await Promise.all([
 client.from('channels').select('id,name,description,community_id,is_private,channel_categories(name),voice_rooms(epoch,locked,participant_limit)').eq('kind','voice').order('position').order('name').limit(200),
 client.rpc('member_communities'),client.from('user_preferences').select('interests').eq('user_id',auth.data.user.id).maybeSingle()
 ]);
 if(channels.error||joined.error||!Array.isArray(joined.data))return{error:'Hangout rooms could not be loaded. Please retry.'};
 const communities=joined.data as {id:string;name:string;slug:string}[];
 const permitted=(channels.data??[]).filter(ch=>communities.some(c=>c.id===ch.community_id));
 const covers=permitted.length?await client.from('communities').select('id,cover,community_headers(version)').in('id',[...new Set(permitted.map(ch=>ch.community_id))]):null;
 let live:Awaited<ReturnType<ReturnType<typeof roomService>['listRooms']>>=[];let mediaAvailable=true;
 try{if(permitted.length)live=await roomService().listRooms();}catch{mediaAvailable=false;}
 const rooms:HangoutRoom[]=[];
 for(let offset=0;offset<permitted.length;offset+=6){const part=await Promise.all(permitted.slice(offset,offset+6).map(async ch=>{
 const access=await client.rpc('channel_access',{p_channel:ch.id,p_permission:'connect'});const canJoin=!access.error&&access.data===true;
 const config=ch.voice_rooms as unknown as {epoch:string;locked:boolean;participant_limit:number}|null;const key=config?`tg_${ch.id.replaceAll('-','')}_${config.epoch.replaceAll('-','')}`:'';const observed=live.find(r=>r.name===key);
 const community=communities.find(c=>c.id===ch.community_id)!;const cover=covers?.data?.find(c=>c.id===community.id);const header=cover?.community_headers as unknown as {version:string}|null;const type=roomType((ch.channel_categories as unknown as {name:string}|null)?.name);
 return{id:ch.id,name:ch.name,description:ch.description,community:{...community,image:header?`/api/communities/${community.id}/header?v=${encodeURIComponent(header.version)}`:cover?.cover?`/covers/${cover.cover}.svg`:null},type,isPrivate:ch.is_private,canJoin,locked:config?.locked??false,limit:canJoin?config?.participant_limit??12:null,count:mediaAvailable&&canJoin?observed?.numParticipants??0:null,participants:[],suggested:!prefs.error&&matchesInterest(type,prefs.data?.interests??[])} satisfies HangoutRoom;
 }));rooms.push(...part);}
 // Only fetch bounded previews for real live rooms. SDK identity alone never grants profile visibility.
 const previewRooms=rooms.filter(r=>r.canJoin&&!r.locked&&(r.count??0)>0).slice(0,4);
 for(const row of previewRooms){const source=permitted.find(ch=>ch.id===row.id)!;const config=source.voice_rooms as unknown as {epoch:string}|null;if(!config)continue;
 try{const key=`tg_${row.id.replaceAll('-','')}_${config.epoch.replaceAll('-','')}`;const [participants,roster]=await Promise.all([roomService().listParticipants(key),client.rpc('community_member_directory',{p_channel:row.id,p_size:50})]);if(roster.error||roster.data?.limited)continue;const identities=new Set(participants.filter(p=>z.uuid().safeParse(p.identity).success).map(p=>p.identity));row.participants=(roster.data?.items??[]).filter((p:{id:string})=>identities.has(p.id)).slice(0,4).map((p:{id:string;name:string;avatar:boolean})=>({id:p.id,name:p.name,avatar:p.avatar}));}catch{/* Missing or changed room: no invented participant previews. */}}
 // Recheck visibility after external calls; revoked room details are not returned.
 for(const room of previewRooms){const check=await client.rpc('channel_access',{p_channel:room.id,p_permission:'connect'});if(check.error||check.data!==true){room.canJoin=false;room.count=null;room.participants=[];room.limit=null;}}
 const visible=rooms.length?await client.from('channels').select('id').in('id',rooms.map(r=>r.id)).eq('kind','voice'):null;if(visible?.error)return{error:'Hangout access could not be refreshed. Please retry.'};
 const allowed=new Set(visible?.data?.map(c=>c.id)??[]);
 return{data:{rooms:rooms.filter(r=>allowed.has(r.id)),observedAt:new Date().toISOString(),mediaAvailable,warning:!mediaAvailable?'Live room activity is unavailable. Open a room to check its connection controls.':covers?.error?'Some community artwork is unavailable.':prefs.error?'Interest suggestions are unavailable; live rooms are still listed.':undefined}};
 }catch{return{error:'Hangouts are unavailable. Check your connection and retry.'};}
}
