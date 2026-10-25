"use server";
import { z } from "zod";
import { createClient } from "../supabase/server";
import type { ChatWorkspaceState } from "./navigation-types";
import type { Person, Result } from "../people/types";
export type WorkspaceChannel = { id:string;name:string;kind:"text"|"voice";category_id:string|null;is_private:boolean;description:string;position:number };
export type WorkspaceNavigation = { communityId:string; channels:WorkspaceChannel[]; categories:{id:string;name:string;position:number}[]; communities:{id:string;name:string;slug:string}[]; role:string; unread:{channel_id:string;unread_count:number}[]; mentions:{channel_id:string;mention_count:number}[]; warning:string; chat?:ChatWorkspaceState };
export type WorkspaceMember = Person & {role:string};
async function identity(){const client=await createClient();const {data,error}=await client.auth.getUser();return !error&&data.user?.email_confirmed_at?{client,user:data.user}:null;}
export async function workspaceNavigation(channel:unknown):Promise<Result<WorkspaceNavigation>>{
 if(!z.uuid().safeParse(channel).success)return {error:"Channel unavailable.",denied:true};
 try{
  const auth=await identity();if(!auth)return {error:"Sign in again.",denied:true};const c=auth.client;
  const selected=await c.from("channels").select("community_id").eq("id",channel).maybeSingle();
  if(selected.error||!selected.data)return {error:"Channel unavailable. Your access may have changed.",denied:true};
  const cid=selected.data.community_id;
  const [channels,categories,communities,role,unread,mentions,chat]=await Promise.all([
   c.from("channels").select("id,name,kind,category_id,is_private,description,position").eq("community_id",cid).order("position").order("name"),
   c.from("channel_categories").select("id,name,position").eq("community_id",cid).order("position").order("name"),
   c.rpc("member_communities"),c.rpc("community_my_role",{p_community:cid}),c.rpc("channel_unread_counts",{p_community:cid}),c.rpc("channel_workspace_mentions",{p_community:cid}),c.rpc("chat_workspace_state",{p_community:cid,p_channel:channel})
  ]);
  if(channels.error||categories.error||communities.error||role.error)return {error:"Community navigation is unavailable. Please retry."};
  return {data:{communityId:cid,channels:channels.data||[],categories:categories.data||[],communities:communities.data||[],role:role.data||"member",unread:unread.data||[],mentions:mentions.data||[],chat:chat.error?undefined:chat.data,warning:unread.error||mentions.error?"Some channel counts are unavailable. The administrator may need to apply the workspace database update.":""}};
 }catch{return {error:"Navigation unavailable. Check your connection and retry."};}
}
export async function switchWorkspaceCommunity(community:unknown):Promise<Result<{href:string}>>{
 if(!z.uuid().safeParse(community).success)return {error:"Community unavailable."};
 try{const auth=await identity();if(!auth)return {error:"Sign in again.",denied:true};const joined=await auth.client.rpc("member_communities");const selected=Array.isArray(joined.data)?joined.data.find((c:{id:string})=>c.id===community):null;if(joined.error||!selected)return {error:"Join this community to browse its channels.",denied:true};const saved=await auth.client.rpc("chat_workspace_state",{p_community:community});if(saved.data?.last_channel){const remembered=await auth.client.from("channels").select("id").eq("community_id",community).eq("id",saved.data.last_channel).maybeSingle();if(remembered.data)return {data:{href:`/channels/${remembered.data.id}`}};}const channels=await auth.client.from("channels").select("id").eq("community_id",community).order("position").order("name").limit(1);if(channels.error)return {error:"Channels unavailable."};return {data:{href:channels.data?.[0]?`/channels/${channels.data[0].id}`:`/communities/${selected.slug}`}};}catch{return {error:"Community navigation unavailable. Please retry."};}
}
export async function workspaceMembers(input:unknown):Promise<Result<{items:WorkspaceMember[]}>>{
 const p=z.strictObject({channel:z.uuid(),after:z.uuid().nullable().default(null)}).safeParse(input);if(!p.success)return {error:"Invalid member request."};
 try{const auth=await identity();if(!auth)return {error:"Sign in again.",denied:true};const r=await auth.client.rpc("channel_workspace_members",{p_channel:p.data.channel,p_after:p.data.after});if(r.error)return {error:["PGRST202","42883"].includes(r.error.code)?"Members need the workspace database update.":"Members unavailable. Your access may have changed.",denied:r.error.code==="42501"};return r.data?.limited?{error:"Please wait before refreshing members."}:{data:r.data};}catch{return {error:"Members unavailable. Check your connection and retry."};}
}
