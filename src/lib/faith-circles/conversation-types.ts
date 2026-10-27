import { z } from 'zod';
const id = z.uuid();
const text = (max: number) => z.string().trim().min(1).max(max).refine(v => [...v].every(c => (c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127) || [9,10,13].includes(c.charCodeAt(0))), 'Remove control characters.');
export const prayerAudience = z.enum(['private','leaders','community']);
const scope = {circle:id};
export const conversationCommandSchema = z.discriminatedUnion('operation', [
 z.strictObject({...scope,operation:z.literal('channels-create')}),
 z.strictObject({...scope,operation:z.literal('channel-link'),purpose:z.enum(['general','scripture','reflections','prayer']),channel:id}),
 z.strictObject({...scope,operation:z.literal('session-thread'),session:id}),
 z.strictObject({...scope,operation:z.literal('preferences'),replies:z.boolean()}),
 z.strictObject({...scope,operation:z.literal('prayer-create'),id,title:text(120),body:text(4000),visibility:prayerAudience.default('private'),guidelines:z.literal(true)}),
 z.strictObject({...scope,operation:z.literal('prayer-save'),prayer:id,revision:z.number().int().positive(),title:text(120),body:text(4000),visibility:prayerAudience,prayer_update:text(4000).or(z.literal('')),testimony:text(4000).or(z.literal(''))}),
 z.strictObject({...scope,operation:z.literal('prayer-status'),prayer:id,status:z.enum(['open','answered','hidden','removed']),reason:text(300).or(z.literal('')).default('')}),
 z.strictObject({...scope,operation:z.literal('comment-save'),prayer:id,id,body:text(2000)}),
 z.strictObject({...scope,operation:z.literal('comment-remove'),prayer:id,id,reason:text(300).or(z.literal('')).default('')}),
 z.strictObject({...scope,operation:z.literal('encourage'),prayer:id,enabled:z.boolean()}),
 z.strictObject({...scope,operation:z.literal('report'),prayer:id,comment:id.nullable().default(null),reason:text(500).min(5)}),
 z.strictObject({...scope,operation:z.literal('report-review'),id,decision:z.enum(['dismissed','actioned'])}),
]);
export const conversationQuerySchema = z.strictObject({...scope,view:z.enum(['channels','prayers','prayer','comments','reports']),resource:id.nullable().default(null),after:id.nullable().default(null),size:z.number().int().min(1).max(40).default(20)});
const channel=z.object({id,name:z.string()});
export const conversationContextSchema=z.object({items:z.array(channel.extend({purpose:z.enum(['general','scripture','reflections','prayer'])})),available:z.array(channel),can_manage:z.boolean(),can_moderate:z.boolean(),replies:z.boolean()});
export const circlePrayerSchema=z.object({id,community_id:id,author_id:id,author_name:z.string(),title:z.string(),body:z.string(),visibility:prayerAudience,status:z.enum(['open','answered','hidden','removed']),revision:z.number().int().positive(),prayer_update:z.string(),testimony:z.string(),encouraged:z.boolean(),can_manage:z.boolean(),moderator:z.boolean(),created_at:z.string(),updated_at:z.string()});
export const prayerCommentSchema=z.object({id,author_id:id,author_name:z.string(),username:z.string().nullable().default(null),avatar:z.boolean().default(false),body:z.string(),own:z.boolean(),created_at:z.string()});
export const prayerReportSchema=z.object({id,prayer_id:id,comment_id:id.nullable(),reason:z.string(),status:z.enum(['open','dismissed','actioned']),created_at:z.string(),can_review:z.boolean()});
export type CirclePrayer=z.infer<typeof circlePrayerSchema>;
export type PrayerComment=z.infer<typeof prayerCommentSchema>;
export type PrayerReport=z.infer<typeof prayerReportSchema>;
export type ConversationContext=z.infer<typeof conversationContextSchema>;
