import { z } from 'zod';
const channel=z.object({id:z.uuid(),name:z.string().max(48)}).nullable();
export const circleSchema=z.object({
 id:z.uuid(),slug:z.string().regex(/^[a-z][a-z0-9-]{2,47}$/),name:z.string().max(80),description:z.string().max(2000),
 privacy:z.enum(['public','discoverable','private']),cover:z.enum(['nebula','aurora','ember','ocean']),header_version:z.string().max(100).nullable(),
 leader:z.object({id:z.uuid(),name:z.string().max(60),username:z.string().nullable(),avatar:z.boolean()}).nullable(),
 joined:z.boolean(),can_manage:z.boolean(),owner:z.boolean(),featured:z.boolean(),study_title:z.string().max(120),passage_reference:z.string().max(100),schedule_note:z.string().max(240),members:z.number().int().nonnegative().nullable(),discussion:channel,hangout:channel,
});
export type Circle=z.infer<typeof circleSchema>;
export type CirclePage={items:Circle[];after:string|null};
export type CircleEvent={id:string;title:string;starts_at:string;circleId:string;circleName:string};
export type Result<T>={data?:T;error?:string;denied?:boolean};
export type FaithHome={featured:Result<CirclePage>;explore:Result<CirclePage>;mine:Result<CirclePage>;events:Result<CircleEvent[]>};
export const directorySchema=z.strictObject({mode:z.enum(['explore','mine','featured']).default('explore'),after:z.uuid().nullable().default(null),size:z.number().int().min(1).max(24).default(12)});
export function circleCover(c:Circle){return c.header_version?`/api/communities/${c.id}/header?v=${encodeURIComponent(c.header_version)}`:`/covers/${c.cover}.svg`;}
