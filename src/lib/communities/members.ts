"use server";
import { z } from "zod";
import { createClient } from "../supabase/server";
import type { Person, Result } from "../people/types";
export type DirectoryMember = Person & { role: string; self: boolean; profile_visible: boolean; can_request: boolean; can_message: boolean };
export type MemberDirectoryData = { community: { id: string; name: string; slug: string }; items: DirectoryMember[]; total: number };
const inputSchema=z.strictObject({ community:z.uuid().nullable().default(null),channel:z.uuid().nullable().default(null),query:z.string().trim().max(48).default(""),after:z.uuid().nullable().default(null),role:z.enum(["all","owner","administrator","moderator","member"]).default("all"),online:z.boolean().default(false),size:z.number().int().min(1).max(50).default(30) }).refine(v=>Boolean(v.community)!==Boolean(v.channel));
function failure(code?: string): { error: string; denied: boolean } {
 return {error:code==="42501"?"Members are unavailable. You may have left this community or lost access.":["PGRST202","42883"].includes(code||"")?"The member list needs the latest database update. Ask the administrator to apply it.":"Members are unavailable. Please retry.",denied:code==="42501"};
}
async function verified(){const c=await createClient();const r=await c.auth.getUser();return !r.error&&r.data.user?.email_confirmed_at?c:null;}
export async function communityMembers(input:unknown):Promise<Result<MemberDirectoryData>>{
 const p=inputSchema.safeParse(input);if(!p.success)return {error:"Choose a community and valid member filters."};
 try{const c=await verified();if(!c)return {error:"Sign in again to browse members.",denied:true};const r=await c.rpc("community_member_directory",{p_community:p.data.community,p_channel:p.data.channel,p_query:p.data.query,p_after:p.data.after,p_role:p.data.role,p_online:p.data.online,p_size:p.data.size});return r.error?failure(r.error.code):r.data?.limited?{error:"Please wait before searching again."}:{data:r.data};}catch{return {error:"Member services are unavailable. Check your connection and retry."};}
}
export async function communityMemberAction(input:unknown):Promise<Result<{ok?:boolean;id?:string}>>{
 const p=z.strictObject({community:z.uuid(),target:z.uuid(),operation:z.enum(["request","open","block"])}).safeParse(input);if(!p.success)return {error:"Invalid member action."};
 try{const c=await verified();if(!c)return {error:"Sign in again to contact members.",denied:true};const budget=await c.rpc("people_budget",{p_operation:"control"});if(budget.error)return failure(budget.error.code);if(!budget.data)return {error:"Please wait before trying again."};const r=await c.rpc("community_member_action",{p_community:p.data.community,p_target:p.data.target,p_operation:p.data.operation});return r.error?r.error.code==="42501"?{error:"This action is unavailable. Their privacy settings or your permissions may have changed.",denied:true}:failure(r.error.code):r.data?.limited?{error:"Please wait before trying again."}:{data:r.data};}catch{return {error:"Member services are unavailable. Please retry."};}
}

export async function joinedMemberCommunities():Promise<Result<{id:string;name:string;slug:string}[]>>{
 try{const c=await verified();if(!c)return {error:"Sign in again to browse members.",denied:true};const r=await c.rpc("member_communities");return r.error?failure(r.error.code):{data:r.data};}catch{return {error:"Community services are unavailable. Please retry."};}
}
