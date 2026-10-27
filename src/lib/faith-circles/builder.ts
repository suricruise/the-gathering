import 'server-only';
import {z} from 'zod';
import {createClient} from '../supabase/server';
import type {Result} from './types';
import {builderCommandSchema,builderQuerySchema,builderDetailSchema,builderStudySchema,builderSessionSchema,builderSessionSummarySchema} from './builder-types';
import {type Receipt,receiptSchema} from './backend-types';
function fail(code?:string):Result<never>{return {error:code==='42501'?'Study authoring is unavailable. Check your Circle permissions or review status.':code==='40001'?'This study changed. Reload before saving; your draft has been kept.':['42883','PGRST202'].includes(code??'')?'The Study Builder database update is required. Contact an administrator.':'The study could not be saved or loaded. Check required fields and retry.',denied:code==='42501'};}
async function client(){const c=await createClient();const a=await c.auth.getUser();return !a.error&&a.data.user?.email_confirmed_at?c:null;}
export async function commandBuilder(input:unknown):Promise<Result<Receipt>>{const p=builderCommandSchema.safeParse(input);if(!p.success)return {error:p.error.issues[0]?.message??'Check the study fields.'};try{const c=await client();if(!c)return fail('42501');const {circle,operation,...data}=p.data;const r=await c.rpc('faith_builder_command',{p_circle:circle,p_operation:operation,p_data:data});if(r.error)return fail(r.error.code);if(r.data?.limited)return {error:'Please wait before saving again.'};const v=receiptSchema.safeParse(r.data);return v.success?{data:v.data}:fail();}catch{return fail();}}
async function read<T>(input:unknown,schema:z.ZodType<T>):Promise<Result<T>>{const p=builderQuerySchema.safeParse(input);if(!p.success)return {error:'Choose a valid study page.'};try{const c=await client();if(!c)return fail('42501');const r=await c.rpc('faith_builder_read',{p_circle:p.data.circle,p_study:p.data.study,p_after:p.data.after,p_size:p.data.size,p_view:p.data.view});if(r.error)return fail(r.error.code);if(r.data?.limited)return {error:'Please wait before loading more.'};const v=schema.safeParse(r.data);return v.success?{data:v.data}:fail();}catch{return fail();}}
export const readBuilderStudies=(input:unknown)=>read(input,z.object({items:z.array(builderStudySchema),platform_admin:z.boolean(),require_review:z.boolean()}));
export const readBuilderDetail=(circle:string,study:string)=>read({circle,study,view:'detail'},builderDetailSchema);
export const readBuilderSessions=(input:unknown)=>read(input,z.object({items:z.array(builderSessionSummarySchema)}));
export const readBuilderSession=(circle:string,study:string,session:string)=>read({circle,study,after:session,view:'session'},builderSessionSchema);
export const readBuilderAudit=(circle:string,study:string)=>read({circle,study,view:'audit'},z.object({items:z.array(z.object({id:z.string(),action:z.string(),revision:z.number().nullable(),created_at:z.string()}))}));
