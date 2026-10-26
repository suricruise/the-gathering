'use server';
import {createClient} from '../supabase/server';
import {revalidatePath} from 'next/cache';
import {z} from 'zod';
import {interestCategories,type DiscoveryStats} from './model';
import {roomService} from '../voice/server';
export type DiscoverySummary={items:DiscoveryStats[];as_of:string;conversations:{id:string;name:string;community_id:string;last_at:string}[];recent:{id:string;body:string;community_id:string;created_at:string}[]};
export async function discoverySummary():Promise<{data?:DiscoverySummary;error?:string}>{
 try{const client=await createClient();const auth=await client.auth.getUser();if(auth.error||!auth.data.user?.email_confirmed_at)return{error:'Sign in to explore communities.'};
 const r=await client.rpc('community_discovery');return r.error||r.data?.limited?{error:'Community activity and categories are unavailable. Please retry later.'}:{data:r.data};
 }catch{return{error:'Community activity could not be loaded. Please retry.'};}
}
export async function setCommunityInterest(_previous:{error?:string;notice?:string},form:FormData):Promise<{error?:string;notice?:string}>{
 const id=z.uuid().safeParse(form.get('community_id')),category=String(form.get('category')??'');if(!id.success||(category!==''&&!interestCategories.some(([v])=>v===category)))return{error:'Choose a valid community and interest.'};
 try{const client=await createClient();const auth=await client.auth.getUser();if(auth.error||!auth.data.user?.email_confirmed_at)return{error:'Sign in again.'};const r=await client.rpc('community_interest_set',{p_community:id.data,p_category:category||null});if(r.error||r.data!==true)return{error:'This category could not be saved. Check your permissions and try again.'};revalidatePath('/','layout');return{notice:'Community interest saved.'};}catch{return{error:'Community settings are unavailable. Please retry.'};}
}
export async function activeHangouts(community?:string):Promise<{items?:{id:string;name:string;participants:number}[];error?:string}>{
 if(community!==undefined&&!z.uuid().safeParse(community).success)return{error:'Community unavailable.'};
 try{const client=await createClient();const auth=await client.auth.getUser();if(auth.error||!auth.data.user?.email_confirmed_at)return{error:'Sign in to view hangouts.'};const budget=await client.rpc('space_budget',{p_operation:'request'});if(budget.error||budget.data!==true)return{error:'Hangout activity is unavailable. Please retry later.'};
 let query=client.from('channels').select('id,name,voice_rooms(epoch,locked)').eq('kind','voice');if(community)query=query.eq('community_id',community);
 const rows=await query.order('position').limit(100);if(rows.error)return{error:'Hangout activity is unavailable.'};const allowed=[];
 const channels=rows.data??[];for(let offset=0;offset<channels.length;offset+=6){const checked=await Promise.all(channels.slice(offset,offset+6).map(async ch=>{const p=await client.rpc('channel_access',{p_channel:ch.id,p_permission:'connect'});return !p.error&&p.data===true?ch:null;}));allowed.push(...checked.filter((ch):ch is typeof channels[number]=>ch!==null));}
 if(!allowed.length)return{items:[]};
 const rooms=await roomService().listRooms();const items=allowed.flatMap(ch=>{const config=ch.voice_rooms as unknown as {epoch:string;locked:boolean}|null;if(!config||config.locked)return[];const room=rooms.find(r=>r.name===`tg_${ch.id.replaceAll('-','')}_${config.epoch.replaceAll('-','')}`);return room&&room.numParticipants>0?[{id:ch.id,name:ch.name,participants:room.numParticipants}]:[];}).sort((a,b)=>b.participants-a.participants||a.id.localeCompare(b.id)).slice(0,4);return{items};
 }catch{return{error:'Live hangout activity is unavailable. Open Hangouts to check rooms.'};}
}
