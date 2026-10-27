import 'server-only';
import {z} from 'zod';
import {createClient} from '../supabase/server';
import type {Result} from './types';
import type {Page} from './backend-types';
import {conversationCommandSchema,conversationQuerySchema,conversationContextSchema,circlePrayerSchema,prayerCommentSchema,prayerReportSchema} from './conversation-types';
function failure(code?:string):Result<never>{return {error:code==='42501'?'This content or action is unavailable. Check your Circle membership and permissions.':code==='40001'?'This prayer changed. Reload it before saving again.':['42883','PGRST202'].includes(code??'')?'Circle discussion and prayer need the Phase 5 database update. Contact an administrator.':'Circle services could not complete this request. Please retry.',denied:code==='42501'};}
async function verified(){const c=await createClient();const r=await c.auth.getUser();return r.error||!r.data.user?.email_confirmed_at?null:c;}
export async function conversationCommand(input:unknown):Promise<Result<{ok:boolean;id?:string;href?:string}>>{
 const p=conversationCommandSchema.safeParse(input);if(!p.success)return {error:'Check the prayer, audience and required fields.'};
 try{const c=await verified();if(!c)return {error:'Sign in to continue.',denied:true};const {circle,operation,...data}=p.data;const r=await c.rpc('faith_conversation_command',{p_circle:circle,p_operation:operation,p_data:data});if(r.error)return failure(r.error.code);if(r.data?.limited)return{error:'Please wait before trying again.'};const v=z.object({ok:z.boolean(),id:z.uuid().optional(),href:z.string().regex(/^\/channels\/[a-f0-9-]{36}\?message=[a-f0-9-]{36}$/).optional()}).safeParse(r.data);return v.success?{data:v.data}:failure();}catch{return failure();}
}
async function read<T>(input:unknown,schema:z.ZodType<T>):Promise<Result<T>>{
 const p=conversationQuerySchema.safeParse(input);if(!p.success)return{error:'Choose a valid Circle and page.'};try{const c=await verified();if(!c)return{error:'Sign in to continue.',denied:true};const {circle,view,resource,after,size}=p.data;const r=await c.rpc('faith_conversation_read',{p_circle:circle,p_view:view,p_resource:resource,p_after:after,p_size:size});if(r.error)return failure(r.error.code);if(r.data?.limited)return{error:'Please wait before loading more.'};const v=schema.safeParse(r.data);return v.success?{data:v.data}:failure();}catch{return failure();}
}
export const readConversationContext=(circle:string)=>read({circle,view:'channels'},conversationContextSchema);
export const readCirclePrayer=(circle:string,resource:string)=>read({circle,resource,view:'prayer'},circlePrayerSchema);
async function page<T extends{id:string}>(input:unknown,schema:z.ZodType<T>):Promise<Result<Page<T>>>{const p=conversationQuerySchema.safeParse(input);if(!p.success)return{error:'Choose a valid prayer page.'};const r=await read(p.data,z.object({items:z.array(schema)}));if(!r.data)return{error:r.error,denied:r.denied};const items=r.data.items.slice(0,p.data.size);return{data:{items,after:r.data.items.length>p.data.size?items.at(-1)!.id:null}};}
export const readCirclePrayers=(input:unknown)=>page(input,circlePrayerSchema);
export const readPrayerComments=(input:unknown)=>page(input,prayerCommentSchema);
export const readPrayerReports=(input:unknown)=>page(input,prayerReportSchema);
