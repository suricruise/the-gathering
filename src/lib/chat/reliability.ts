"use server";
import { z } from "zod";
import { requireUser } from "../auth/session";
import { seqSchema } from "./validation";
import type { ChatPage, ChatResult, ChatState } from "./types";
async function call<T>(name: string, args: Record<string, unknown>): Promise<ChatResult<T>> {
  const { client } = await requireUser("/channels");
  try { const r = await client.rpc(name, args); return r.error ? { denied: r.error.code === "42501", error: r.error.code === "42501" ? "Channel access is unavailable." : ["42883", "PGRST202"].includes(r.error.code) ? "Chat needs the reliability database update." : "Chat is unavailable. Check your connection and retry." } : { data: r.data }; }
  catch { return { error: "Chat is unavailable. Check your connection and retry." }; }
}
export async function getConversationPage(input: unknown): Promise<ChatResult<ChatPage>> {
  const p = z.strictObject({ channelId: z.uuid(), mode: z.enum(["initial", "latest", "before", "after"]).default("initial"), cursor: seqSchema.nullable().default(null) }).refine(v => !["before", "after"].includes(v.mode) || v.cursor !== null).safeParse(input);
  if(!p.success) return { error: "Invalid conversation page." };
  return call("chat_conversation_page", { p_channel: p.data.channelId, p_mode: p.data.mode, p_cursor: p.data.cursor });
}
export async function getChatState(channel: string): Promise<ChatResult<ChatState>> { return z.uuid().safeParse(channel).success ? call("chat_state", { p_channel: channel }) : { error: "Invalid channel." }; }
export async function getReceiptSnapshot(channel: string, ids: string[]): Promise<ChatResult<{id:string;read_count:number}[]>> {
  const p = z.object({channel:z.uuid(),ids:z.array(z.uuid()).max(100)}).safeParse({channel,ids});
  return p.success ? call("chat_receipt_snapshot", { p_channel: channel, p_ids: ids }) : { error: "Invalid receipt batch." };
}
export async function markAllRead(channel: string): Promise<ChatResult<ChatState>> { return z.uuid().safeParse(channel).success ? call("chat_mark_all_read", { p_channel: channel }) : { error: "Invalid channel." }; }
export async function getCommunityChatState(community: string): Promise<ChatResult<{unread:{channel_id:string;unread_count:number}[];mentions:{channel_id:string;mention_count:number}[]}>> { return z.uuid().safeParse(community).success ? call("chat_community_state", { p_community: community }) : { error: "Invalid community." }; }
