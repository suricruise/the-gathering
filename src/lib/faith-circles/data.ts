import 'server-only';
import {z} from 'zod';
import type {SupabaseClient} from '@supabase/supabase-js';
import {createClient} from '../supabase/server';
import {circleSchema,directorySchema,type Circle,type CirclePage,type CircleEvent,type Result,type FaithHome} from './types';
function failure(code?:string):{error:string;denied:boolean}{return{error:code==='42501'?'This Circle is unavailable. Your access may have changed.':['42883','PGRST202'].includes(code??'')?'Faith Circles needs its foundation database update. Please contact an administrator.':'Faith Circles could not be loaded. Please retry.',denied:code==='42501'};}
async function verified(){const client=await createClient();const r=await client.auth.getUser();return r.error||!r.data.user?.email_confirmed_at?null:client;}
async function directory(client:SupabaseClient,input:z.infer<typeof directorySchema>):Promise<Result<CirclePage>>{
 const r=await client.rpc('faith_circle_directory',{p_mode:input.mode,p_after:input.after,p_size:input.size});if(r.error)return failure(r.error.code);if(r.data?.limited)return{error:'Please wait before browsing more Circles.'};
 const p=z.object({items:z.array(circleSchema)}).safeParse(r.data);if(!p.success)return failure();const items=p.data.items.slice(0,input.size);return{data:{items,after:p.data.items.length>input.size?items.at(-1)!.id:null}};
}
export async function readCircles(input:unknown):Promise<Result<CirclePage>>{
 const p=directorySchema.safeParse(input);if(!p.success)return{error:'Choose a valid Circle page.'};try{const client=await verified();return client?await directory(client,p.data):{error:'Sign in to view Faith Circles.',denied:true};}catch{return failure();}
}
export async function readCircle(input:unknown):Promise<Result<Circle>>{
 const p=z.uuid().safeParse(input);if(!p.success)return{error:'Circle unavailable.',denied:true};try{const client=await verified();if(!client)return{error:'Sign in to view this Circle.',denied:true};const r=await client.rpc('faith_circle_get',{p_community:p.data});if(r.error)return failure(r.error.code);if(r.data?.limited)return{error:'Please wait before opening this Circle again.'};if(!r.data)return{error:'Circle unavailable.',denied:true};const parsed=circleSchema.safeParse(r.data);return parsed.success?{data:parsed.data}:failure();}catch{return failure();}
}
export async function readFaithHome():Promise<Result<FaithHome>>{
 try{const client=await verified();if(!client)return{error:'Sign in to view Faith Circles.',denied:true};const [featured,explore,mine]=await Promise.all([directory(client,{mode:'featured',after:null,size:6}),directory(client,{mode:'explore',after:null,size:12}),directory(client,{mode:'mine',after:null,size:12})]);
 let events:Result<CircleEvent[]>={data:[]};
 if(mine.error)events={error:'Study Hangouts are unavailable while your Circles load.'};
 else{const r=await client.rpc('faith_circle_events');const parsed=z.object({items:z.array(z.object({id:z.uuid(),title:z.string().max(100),starts_at:z.iso.datetime({offset:true}),circleId:z.uuid(),circleName:z.string().max(80)}))}).safeParse(r.data);
 events=r.error||!parsed.success?{error:'Upcoming study Hangouts could not be loaded.'}:{data:parsed.data.items};}
 return{data:{featured,explore,mine,events}};
 }catch{return failure();}
}
