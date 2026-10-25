"use server";
import{z}from'zod';
import{requireUser}from'../auth/session';
import{seqSchema}from'./validation';
import type{ChatResult}from'./types';
import type{ChatWorkspaceState,SearchPage}from'./navigation-types';
const mode=z.enum(['inherit','all','mentions','muted']);
async function call<T>(name:string,args:Record<string,unknown>):Promise<ChatResult<T>>{
 const{client}=await requireUser('/channels');try{const r=await client.rpc(name,args);return r.error?{denied:r.error.code==='42501',error:r.error.code==='42501'?'Chat access is unavailable.':['42883','PGRST202'].includes(r.error.code)?'Chat needs the navigation and search database update.':r.error.code==='P0001'?'Please wait before trying again.':'The request could not be completed. Check your filters or connection.'}:{data:r.data};}catch{return{error:'Chat services are unavailable. Please retry.'};}
}
export async function getWorkspaceState(community:string,channel:string|null=null):Promise<ChatResult<ChatWorkspaceState>>{return z.uuid().safeParse(community).success&&(channel===null||z.uuid().safeParse(channel).success)?call('chat_workspace_state',{p_community:community,p_channel:channel}):{error:'Invalid community.'};}
export async function saveNavigation(input:unknown):Promise<ChatResult<ChatWorkspaceState>>{
 const p=z.strictObject({channel:z.uuid(),collapsed:z.array(z.union([z.uuid(),z.literal('uncategorized')])).max(100).nullable().default(null)}).safeParse(input);return p.success?call('chat_save_navigation',{p_channel:p.data.channel,p_collapsed:p.data.collapsed}):{error:'Invalid navigation preference.'};
}
export async function saveNotifications(input:unknown):Promise<ChatResult<ChatWorkspaceState>>{
 const p=z.strictObject({channel:z.uuid(),communityMode:mode,channelMode:mode}).safeParse(input);return p.success?call('chat_save_notifications',{p_channel:p.data.channel,p_community_mode:p.data.communityMode,p_channel_mode:p.data.channelMode}):{error:'Invalid notification preference.'};
}
const day=z.iso.date().nullable().default(null);
const searchSchema=z.strictObject({community:z.uuid(),channel:z.uuid().nullable().default(null),query:z.string().trim().max(100).default(''),author:z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9_]{2,23}$/).nullable().default(null),from:day,until:day,before:seqSchema.nullable().default(null),threads:z.boolean().default(true)}).refine(v=>(v.query.length>=2||v.author||v.from||v.until)&&(!v.from||!v.until||v.from<=v.until));
export async function searchCommunity(input:unknown):Promise<ChatResult<SearchPage>>{
 const p=searchSchema.safeParse(input);if(!p.success)return{error:'Enter at least two search characters, a username, or a valid date range.'};const v=p.data;return call('chat_search',{p_community:v.community,p_query:v.query,p_channel:v.channel,p_author:v.author,p_from:v.from,p_until:v.until,p_before:v.before,p_threads:v.threads});
}
export async function firstUnread(channel:string):Promise<ChatResult<import('./types').ChatMessage|null>>{return z.uuid().safeParse(channel).success?call('chat_first_unread',{p_channel:channel}):{error:'Invalid channel.'};}
