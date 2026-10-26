'use server';
import {z} from 'zod';
import {createClient} from '../supabase/server';
import type {DiscoveryStats} from '../discovery/model';
export type CommunityOverview={stats:DiscoveryStats|null;member:boolean;guidelines:string|null;conversations:{id:string;name:string;updated_at:string}[]|null};
export async function communityOverview(community:unknown):Promise<{data?:CommunityOverview;error?:string;denied?:boolean}>{
 const parsed=z.uuid().safeParse(community);if(!parsed.success)return{error:'Community unavailable.',denied:true};
 try{
 const client=await createClient();const auth=await client.auth.getUser();if(auth.error||!auth.data.user?.email_confirmed_at)return{error:'Sign in again.',denied:true};
 const access=await client.rpc('community_access',{p_community:parsed.data});if(access.error||access.data!==true)return{error:'Community unavailable. Your access may have changed.',denied:true};
 const budget=await client.rpc('space_budget',{p_operation:'request'});if(budget.error||budget.data!==true)return{error:'Community activity is unavailable. Please retry later.'};
 const [role,stats]=await Promise.all([client.rpc('community_my_role',{p_community:parsed.data}),client.rpc('community_discovery')]);if(role.error)return{error:'Community membership could not be checked.'};
 const summary:CommunityOverview={stats:stats.error||stats.data?.limited?null:stats.data?.items?.find((c:DiscoveryStats)=>c.id===parsed.data)??null,member:!!role.data,guidelines:null,conversations:[]};
 if(!summary.member)return{data:summary};
 const [settings,messages]=await Promise.all([
 client.from('community_settings').select('guidelines').eq('community_id',parsed.data).maybeSingle(),
 client.from('messages').select('channel_id,created_at,channels!inner(name,community_id)').eq('channels.community_id',parsed.data).is('deleted_at',null).gte('created_at',new Date(Date.now()-7*86400000).toISOString()).order('created_at',{ascending:false}).limit(80)
 ]);
 summary.guidelines=settings.error?null:settings.data?.guidelines??'';
 if(messages.error)summary.conversations=null;else{const seen=new Set<string>();summary.conversations=(messages.data??[]).flatMap(m=>{if(seen.has(m.channel_id))return[];seen.add(m.channel_id);const channel=m.channels as unknown as {name:string};return[{id:m.channel_id,name:channel.name,updated_at:m.created_at}];}).slice(0,4);}
 return{data:summary};
 }catch{return{error:'Community activity is unavailable. Please retry.'};}
}
