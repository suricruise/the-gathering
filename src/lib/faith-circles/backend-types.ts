import{z}from'zod';
const id=z.uuid();
const safeControls=(v:string)=>Array.from(v).every(c=>{const n=c.charCodeAt(0);return(n>=32&&n!==127)||[9,10,13].includes(n);});
const text=(max:number)=>z.string().trim().min(1).max(max).refine(safeControls,'Remove control characters.');
const optionalText=(max:number)=>z.string().max(max).refine(safeControls,'Remove control characters.');
const cover=z.enum(['nebula','aurora','ember','ocean']),revision=z.number().int().positive();
export const passageSchema=text(100).regex(/^[1-4]? ?[A-Za-z]+( [A-Za-z]+){0,3} [1-9][0-9]{0,2}(:[1-9][0-9]{0,2}(-[1-9][0-9]{0,2})?)?$/);
const fields={circle:id};
export const backendCommandSchema=z.discriminatedUnion('operation',[
 z.strictObject({...fields,operation:z.literal('circle-create'),discussion:id.nullable().default(null),hangout:id.nullable().default(null)}),
 ...(['join','leave','join-request','request-cancel']as const).map(operation=>z.strictObject({...fields,operation:z.literal(operation)})),
 z.strictObject({...fields,operation:z.literal('accept-invite'),token:z.string().regex(/^[a-f0-9]{64}$/)}),
 z.strictObject({...fields,operation:z.literal('request-decide'),target:id,accept:z.boolean()}),
 z.strictObject({...fields,operation:z.literal('co-leader'),target:id,enabled:z.boolean()}),
 z.strictObject({...fields,operation:z.literal('study-create'),id,title:text(120),description:optionalText(4000).default(''),cover:cover.default('nebula'),duration_days:z.number().int().min(1).max(366)}),
 z.strictObject({...fields,operation:z.literal('study-update'),study:id,revision,title:text(120),description:optionalText(4000),cover,duration_days:z.number().int().min(1).max(366)}),
 z.strictObject({...fields,operation:z.literal('study-publish'),study:id,revision,rights_confirmed:z.literal(true)}),
 z.strictObject({...fields,operation:z.literal('study-archive'),study:id,revision}),
 z.strictObject({...fields,operation:z.literal('session-save'),study:id,revision,id,session_number:z.number().int().min(1).max(366),title:text(120),scripture_reference:passageSchema,teaching_content:optionalText(20000),application_challenge:optionalText(4000),prayer_prompt:optionalText(4000),release_at:z.iso.datetime({offset:true}).nullable().default(null)}),
 z.strictObject({...fields,operation:z.literal('question-save'),study:id,revision,id,session:id,question_text:text(2000),display_order:z.number().int().min(0).max(49)}),
 z.strictObject({...fields,operation:z.literal('progress-save'),session:id,completed:z.boolean()}),
 z.strictObject({...fields,operation:z.literal('response-save'),id,session:id,question:id,response_text:text(8000),audience:z.enum(['private','circle']).default('private'),revision:revision.optional()}),
 z.strictObject({...fields,operation:z.literal('response-remove'),id}),
 z.strictObject({...fields,operation:z.literal('response-moderate'),id,reason:text(300)}),
 z.strictObject({...fields,operation:z.literal('prayer-create'),id,title:text(120),content:text(4000),visibility:z.enum(['community','moderators']),guidelines:z.literal(true)}),
]);
export type BackendCommand=z.infer<typeof backendCommandSchema>;
export type CommandOf<T extends BackendCommand['operation']>=Omit<Extract<z.input<typeof backendCommandSchema>,{operation:T}>,'operation'>;
export const backendQuerySchema=z.strictObject({circle:id,resource:id.nullable().default(null),after:id.nullable().default(null),size:z.number().int().min(1).max(40).default(20)});
export const studySchema=z.object({id,circle_id:id,title:z.string(),description:z.string(),cover_image:cover,created_by:id.nullable(),duration_days:z.number().int(),status:z.enum(['draft','published','archived']),rights_confirmed:z.boolean(),revision,created_at:z.string(),updated_at:z.string()});
export const sessionSchema=z.object({id,study_id:id,session_number:z.number().int(),title:z.string(),scripture_reference:z.string(),teaching_content:z.string(),application_challenge:z.string(),prayer_prompt:z.string(),release_at:z.string().nullable(),created_at:z.string()});
export const questionSchema=z.object({id,session_id:id,question_text:z.string(),display_order:z.number().int()});
export const responseSchema=z.object({id,session_id:id,question_id:id,author_id:id,response_text:z.string(),audience:z.enum(['private','circle']),revision,hidden_at:z.string().nullable(),removed_at:z.string().nullable(),created_at:z.string(),updated_at:z.string()});
export const progressSchema=z.object({id,user_id:id,session_id:id,completed_at:z.string(),study_revision:revision});
export const prayerSchema=z.object({id,community_id:id,author_id:id,title:z.string(),body:z.string(),visibility:z.enum(['community','moderators','private','leaders']),status:z.enum(['open','answered','hidden','removed']),created_at:z.string(),updated_at:z.string()});
export const circleMemberSchema=z.object({id,user_id:id,circle_id:id,role:z.enum(['leader','co_leader','member']),joined_at:z.string(),name:z.string()});
export const joinRequestSchema=z.object({id,circle_id:id,user_id:id,status:z.enum(['pending','accepted','declined','cancelled']),created_at:z.string(),updated_at:z.string()});
export const receiptSchema=z.object({id,revision:revision.optional(),ok:z.boolean().optional()});
export type Study=z.infer<typeof studySchema>;export type StudySession=z.infer<typeof sessionSchema>;export type StudyQuestion=z.infer<typeof questionSchema>;export type StudyResponse=z.infer<typeof responseSchema>;export type StudyProgress=z.infer<typeof progressSchema>;export type CirclePrayer=z.infer<typeof prayerSchema>;
export type Page<T>={items:T[];after:string|null};export type Receipt=z.infer<typeof receiptSchema>;
