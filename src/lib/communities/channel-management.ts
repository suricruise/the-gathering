import { z } from "zod";
export const managedChannelSchema = z.object({
  id: z.union([z.uuid(), z.literal("")]),
  name: z.string().regex(/^[a-z0-9][a-z0-9-]{0,47}$/),
  description: z.string().max(1000), kind: z.enum(["text", "voice"]),
  category_id: z.union([z.uuid(), z.literal("")]),
  position: z.coerce.number().int().min(0).max(999), is_private: z.boolean(),
  attachment_policy: z.enum(["posters", "staff", "none"]),
  notification_default: z.enum(["inherit", "all", "mentions", "muted"]),
  reason: z.string().trim().min(5).max(500),
}).strict();
export const channelManagementSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("save"), data: managedChannelSchema }),
  z.object({ operation:z.literal("category"),data:z.object({id:z.union([z.uuid(),z.literal("")]),name:z.string().trim().min(1).max(60),position:z.coerce.number().int().min(0).max(999),reason:z.string().trim().min(5).max(500)}).strict()}),
  z.object({ operation: z.enum(["archive", "restore", "delete"]), data: z.object({id:z.uuid(),confirmation:z.string().min(1).max(48),reason:z.string().trim().min(5).max(500)}).strict() }),
  z.object({ operation: z.literal("restrict"), data: z.object({user_id:z.uuid(),minutes:z.coerce.number().int().min(1).max(10080),reason:z.string().trim().min(5).max(500)}).strict() }),
  z.object({ operation: z.literal("unrestrict"), data: z.object({user_id:z.uuid(),reason:z.string().trim().min(5).max(500)}).strict() }),
]);
export type ManagedChannel = z.infer<typeof managedChannelSchema> & { archived_at: string | null; disabled: boolean };
export type ChannelManagementData = {community_slug:string;can_manage:boolean;channels:ManagedChannel[];categories:{id:string;name:string;position?:number}[];members:{user_id:string;username:string;display_name:string}[];restrictions:{user_id:string;until_at:string}[]};
