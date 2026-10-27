import 'server-only';
import{z}from'zod';import{createClient}from'../supabase/server';import type{Result}from'./types';
import{backendCommandSchema,backendQuerySchema,studySchema,sessionSchema,questionSchema,responseSchema,progressSchema,prayerSchema,circleMemberSchema,joinRequestSchema,receiptSchema,type BackendCommand,type CommandOf,type Page,type Receipt}from'./backend-types';
function failure(code?:string):Result<never>{return{error:code==='42501'?'This Circle or study is unavailable. Check your current membership and permissions.':code==='40001'?'This item changed. Reload it before saving again.':['22023','23514','23505','23503','22P02'].includes(code??'')?'Check the study details, order and identifiers before retrying.':['42883','PGRST202'].includes(code??'')?'Faith Circles needs its Phase 2 database update. Contact an administrator.':'Faith Circles services are unavailable. Please retry.',denied:code==='42501'};}
async function verified(){const c=await createClient();const r=await c.auth.getUser();return r.error||!r.data.user?.email_confirmed_at?null:c;}
export async function executeCircleCommand(input:unknown):Promise<Result<Receipt>>{
 const p=backendCommandSchema.safeParse(input);if(!p.success)return{error:'Check the required Circle fields and remove unsupported inputs.'};
 try{const c=await verified();if(!c)return{error:'Sign in to continue.',denied:true};const{operation,circle,...data}=p.data;const r=await c.rpc('faith_backend_command',{p_operation:operation,p_circle:circle,p_data:data});if(r.error)return failure(r.error.code);if(r.data?.limited)return{error:'Please wait before trying again.'};const receipt=receiptSchema.safeParse(r.data);return receipt.success?{data:receipt.data}:failure();}catch{return failure();}
}
async function readPage<T extends{id:string}>(view:string,input:unknown,schema:z.ZodType<T>):Promise<Result<Page<T>>>{
 const p=backendQuerySchema.safeParse(input);if(!p.success)return{error:'Choose a valid Circle, resource and page.'};try{const c=await verified();if(!c)return{error:'Sign in to continue.',denied:true};const r=await c.rpc('faith_backend_read',{p_view:view,p_circle:p.data.circle,p_resource:p.data.resource,p_after:p.data.after,p_size:p.data.size});if(r.error)return failure(r.error.code);if(r.data?.limited)return{error:'Please wait before loading more study information.'};const parsed=z.object({items:z.array(schema)}).safeParse(r.data);if(!parsed.success)return failure();const items=parsed.data.items.slice(0,p.data.size);return{data:{items,after:parsed.data.items.length>p.data.size?items.at(-1)!.id:null}};}catch{return failure();}
}
// The foundation's readCircles/readCircle remain the discoverable-directory/detail services.
export const createCircle=(input:CommandOf<'circle-create'>)=>executeCircleCommand({...input,operation:'circle-create'});
export const joinCircle=(input:CommandOf<'join'>)=>executeCircleCommand({...input,operation:'join'});
export const requestCircleMembership=(input:CommandOf<'join-request'>)=>executeCircleCommand({...input,operation:'join-request'});
export const cancelCircleMembershipRequest=(input:CommandOf<'request-cancel'>)=>executeCircleCommand({...input,operation:'request-cancel'});
export const acceptCircleInvitation=(input:CommandOf<'accept-invite'>)=>executeCircleCommand({...input,operation:'accept-invite'});
export const leaveCircle=(input:CommandOf<'leave'>)=>executeCircleCommand({...input,operation:'leave'});
export const decideCircleMembership=(input:CommandOf<'request-decide'>)=>executeCircleCommand({...input,operation:'request-decide'});
export const setCircleCoLeader=(input:CommandOf<'co-leader'>)=>executeCircleCommand({...input,operation:'co-leader'});
export const createStudy=(input:CommandOf<'study-create'>)=>executeCircleCommand({...input,operation:'study-create'});
export const updateStudy=(input:CommandOf<'study-update'>)=>executeCircleCommand({...input,operation:'study-update'});
export const publishStudy=(input:CommandOf<'study-publish'>)=>executeCircleCommand({...input,operation:'study-publish'});
export const archiveStudy=(input:CommandOf<'study-archive'>)=>executeCircleCommand({...input,operation:'study-archive'});
export const saveStudySession=(input:CommandOf<'session-save'>)=>executeCircleCommand({...input,operation:'session-save'});
export const saveStudyQuestion=(input:CommandOf<'question-save'>)=>executeCircleCommand({...input,operation:'question-save'});
export const saveStudyProgress=(input:CommandOf<'progress-save'>)=>executeCircleCommand({...input,operation:'progress-save'});
export const saveStudyResponse=(input:CommandOf<'response-save'>)=>executeCircleCommand({...input,operation:'response-save'});
export const removeStudyResponse=(input:CommandOf<'response-remove'>)=>executeCircleCommand({...input,operation:'response-remove'});
export const moderateStudyResponse=(input:CommandOf<'response-moderate'>)=>executeCircleCommand({...input,operation:'response-moderate'});
export const createCirclePrayer=(input:CommandOf<'prayer-create'>)=>executeCircleCommand({...input,operation:'prayer-create'});
export type CircleQuery=z.input<typeof backendQuerySchema>;
export const retrievePublishedStudies=(input:CircleQuery)=>readPage('published-studies',input,studySchema);
export const retrieveLeaderStudies=(input:CircleQuery)=>readPage('studies',input,studySchema);
export const retrieveStudySessions=(input:CircleQuery)=>readPage('sessions',input,sessionSchema);
export const retrieveStudyQuestions=(input:CircleQuery)=>readPage('questions',input,questionSchema);
export const retrieveStudyResponses=(input:CircleQuery)=>readPage('responses',input,responseSchema);
export const retrieveStudyProgress=(input:CircleQuery)=>readPage('progress',input,progressSchema);
export const retrieveCirclePrayers=(input:CircleQuery)=>readPage('prayers',input,prayerSchema);
export const retrieveCircleMembers=(input:CircleQuery)=>readPage('members',input,circleMemberSchema);
export const retrieveMyCircleRequest=(input:CircleQuery)=>readPage('my-request',input,joinRequestSchema);
export const retrieveCircleJoinRequests=(input:CircleQuery)=>readPage('requests',input,joinRequestSchema);
export type{BackendCommand};
