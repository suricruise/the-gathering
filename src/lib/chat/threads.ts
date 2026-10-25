"use server";
import { z } from "zod";
import { requireUser } from "../auth/session";
import { seqSchema } from "./validation";
import type { ChatResult, ThreadPage } from "./types";
export async function getThreadPage(input: unknown): Promise<ChatResult<ThreadPage>> {
  const p = z.strictObject({ channelId: z.uuid(), parentId: z.uuid(), before: seqSchema.nullable().default(null) }).safeParse(input);
  if (!p.success) return { error: "Choose a valid thread and cursor." };
  const { client } = await requireUser("/channels");
  try {
    const r = await client.rpc("channel_thread_page", { p_channel: p.data.channelId, p_parent: p.data.parentId, p_before: p.data.before });
    if (r.error) return { denied: r.error.code === "42501", error: r.error.code === "42501" ? "This thread is unavailable. Your access may have changed." : ["42883", "PGRST202"].includes(r.error.code) ? "Threads need the channel threads database update." : "Thread unavailable. Check your connection and retry." };
    if (!r.data || r.data.root?.id !== p.data.parentId || r.data.root?.channel_id !== p.data.channelId || r.data.root?.parent_id !== null) return { error: "Thread unavailable." };
    return { data: r.data };
  } catch { return { error: "Thread unavailable. Check your connection and retry." }; }
}
