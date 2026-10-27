import {z} from 'zod';
import {passageSchema,studySchema,sessionSchema,questionSchema} from './backend-types';
import {topicSchema} from './discovery-types';
const id=z.uuid(),revision=z.number().int().positive();
const text=(max:number)=>z.string().max(max).refine(v=>[...v].every(c=>(c.charCodeAt(0)>=32&&c.charCodeAt(0)!==127)||'\n\r\t'.includes(c)),'Remove control characters.');
const scope={circle:id,study:id,revision};
export const builderCommandSchema=z.discriminatedUnion('operation',[
 z.strictObject({circle:id,study:id,operation:z.literal('create')}),
 z.strictObject({circle:id,operation:z.literal('review-policy'),required:z.boolean()}),
 z.strictObject({...scope,operation:z.literal('details'),title:text(120).trim().min(1),description:text(4000),intended_audience:text(500),cover:z.enum(['nebula','aurora','ember','ocean']),duration_days:z.number().int().min(1).max(366),planned_sessions:z.number().int().min(1).max(366),topic:topicSchema.nullable()}),
 z.strictObject({...scope,operation:z.literal('session'),id,title:text(120).trim().min(1),scripture_reference:passageSchema,teaching_content:text(20000),application_challenge:text(4000),prayer_prompt:text(4000),media_link:z.union([z.literal(''),z.url().max(2000).refine(v=>{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password;},'Use an HTTPS link without credentials.')]),release_at:z.iso.datetime({offset:true}).nullable(),questions:z.array(z.strictObject({id,question_text:text(2000).trim().min(1)})).min(1).max(50)}),
 z.strictObject({...scope,operation:z.literal('reorder'),ids:z.array(id).min(1).max(366)}),
 ...(['submit','publish']as const).map(operation=>z.strictObject({...scope,operation:z.literal(operation),rights_confirmed:z.literal(true)})),
 z.strictObject({...scope,operation:z.literal('withdraw')}),
 z.strictObject({...scope,operation:z.literal('archive'),reason:text(500).trim().min(5)}),
 z.strictObject({...scope,operation:z.literal('review'),decision:z.enum(['approved','changes_requested']),reason:text(500).trim().min(5)}),
]);
export const builderQuerySchema=z.strictObject({circle:id,study:id.nullable().default(null),after:id.nullable().default(null),size:z.number().int().min(1).max(40).default(20),view:z.enum(['studies','detail','sessions','session','audit']).default('studies')});
export const builderStudySchema=studySchema.extend({intended_audience:z.string(),planned_sessions:z.number().int(),discovery_topic:topicSchema.nullable(),review_state:z.string().nullable().optional()});
export const builderDetailSchema=z.object({study:builderStudySchema,review:z.object({state:z.enum(['submitted','approved','changes_requested']),reason:z.string()}).nullable(),platform_admin:z.boolean(),require_review:z.boolean(),cover_version:id.nullable()});
export const builderSessionSchema=sessionSchema.extend({media_link:z.string().default(''),questions:z.array(questionSchema)});
export const builderSessionSummarySchema=z.object({id,title:z.string(),session_number:z.number().int(),release_at:z.string().nullable()});
export type BuilderStudy=z.infer<typeof builderStudySchema>;
export type BuilderDetail=z.infer<typeof builderDetailSchema>;
export type BuilderSession=z.infer<typeof builderSessionSchema>;
export type SessionSummary=z.infer<typeof builderSessionSummarySchema>;
export type BuilderCommand=z.input<typeof builderCommandSchema>;
