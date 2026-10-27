import{z}from'zod';
const id=z.uuid(),text=(n:number)=>z.string().trim().min(1).max(n).refine(v=>[...v].every(c=>(c.charCodeAt(0)>=32&&c.charCodeAt(0)!==127)||[9,10,13].includes(c.charCodeAt(0))),'Remove control characters.');
const audience={audience:z.enum(['circle','selected']),participants:z.array(id).max(100)},base={circle:id,id};
export const studyHangoutCommandSchema=z.discriminatedUnion('operation',[
 z.strictObject({...base,operation:z.literal('publish'),session:id,title:text(100).min(3),description:text(5000),starts_local:z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),ends_local:z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),time_zone:text(80),limit:z.number().int().min(2).max(50),...audience}),
 z.strictObject({...base,operation:z.literal('access'),revision:z.number().int().positive(),...audience}),
 ...(['cancel','end']as const).map(operation=>z.strictObject({...base,operation:z.literal(operation),revision:z.number().int().positive()})),
 z.strictObject({...base,operation:z.literal('remove'),target:id,reason:text(300).min(5)}),
]);
export const studyHangoutQuerySchema=z.strictObject({view:z.enum(['circles','studies','sessions','members','index','detail','questions','participants']),circle:id.nullable().default(null),resource:id.nullable().default(null),after:id.nullable().default(null),size:z.number().int().min(1).max(40).default(20)});
export const studyHangoutSchema=z.object({id,circle:id,circle_name:z.string(),study:id,session:id,title:z.string(),description:z.string(),starts_at:z.string(),ends_at:z.string(),time_zone:z.string(),channel:id,audience:z.enum(['circle','selected']),revision:z.number().int().positive(),host:id,state:z.enum(['upcoming','live','ended','cancelled']),can_manage:z.boolean(),can_moderate:z.boolean(),can_join:z.boolean(),limit:z.number().int(),reference:z.string().nullable(),study_title:z.string().nullable(),session_title:z.string().nullable(),reading_available:z.boolean()});
export const hangoutOptionSchema=z.object({id,name:z.string().optional(),title:z.string().optional(),session_number:z.number().int().optional(),release_at:z.string().nullable().optional()});
export const hangoutQuestionSchema=z.object({id,question_text:z.string(),display_order:z.number().int()});
export type StudyHangout=z.infer<typeof studyHangoutSchema>;export type HangoutOption=z.infer<typeof hangoutOptionSchema>;export type HangoutQuestion=z.infer<typeof hangoutQuestionSchema>;
