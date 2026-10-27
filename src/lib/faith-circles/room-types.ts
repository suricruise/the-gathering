import{z}from'zod';import{circleSchema}from'./types';import{sessionSchema,responseSchema}from'./backend-types';
const id=z.uuid(),text=z.string().trim().max(8000).refine(v=>Array.from(v).every(c=>(c.charCodeAt(0)>=32&&c.charCodeAt(0)!==127)||[9,10,13].includes(c.charCodeAt(0))),'Remove control characters.');
export const roomScopeSchema=z.strictObject({circle:id,study:id,session:id});
export const roomQuerySchema=roomScopeSchema.extend({view:z.enum(['context','sessions','questions','question','shared']),after:id.nullable().default(null),size:z.number().int().min(1).max(40).default(20)});
export const roomMutationSchema=z.discriminatedUnion('operation',[
 roomScopeSchema.extend({operation:z.literal('visit')}),roomScopeSchema.extend({operation:z.literal('complete'),completed:z.boolean()}),
 roomScopeSchema.extend({operation:z.literal('reflection'),kind:z.enum(['application','prayer']),body:text,revision:z.number().int().nonnegative()}),
 roomScopeSchema.extend({operation:z.literal('answer'),id,question:id,response_text:text.min(1),audience:z.enum(['private','circle']),revision:z.number().int().positive().optional()}),
]);
export const noteSchema=z.object({id,session_id:id,kind:z.enum(['application','prayer']),body:z.string(),revision:z.number().int().positive(),updated_at:z.string()});
export const roomContextSchema=z.object({session:sessionSchema,circle:circleSchema,study:z.object({id,title:z.string()}),completed:z.boolean(),total:z.number().int(),done:z.number().int(),previous:id.nullable(),next:id.nullable(),notes:z.array(noteSchema),hangout:z.object({id,title:z.string(),starts_at:z.string(),ends_at:z.string(),time_zone:z.string()}).nullable()});
export const roomSessionSchema=z.object({id,title:z.string(),number:z.number().int(),completed:z.boolean()});
export const roomQuestionSchema=z.object({id,question_text:z.string(),display_order:z.number().int(),own:responseSchema.nullable()});
export const sharedAnswerSchema=z.object({response:responseSchema,member:z.object({id,name:z.string()})});
export type RoomScope=z.infer<typeof roomScopeSchema>;export type RoomContext=z.infer<typeof roomContextSchema>;export type RoomQuestion=z.infer<typeof roomQuestionSchema>;export type SharedAnswer=z.infer<typeof sharedAnswerSchema>;export type RoomSession=z.infer<typeof roomSessionSchema>;export type Reflection=z.infer<typeof noteSchema>;
