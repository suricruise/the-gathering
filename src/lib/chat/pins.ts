"use server";
import { z } from "zod";
import { requireUser } from "../auth/session";
import type { ChatMessage, ChatResult } from "./types";
function failure(code?: string): ChatResult<never> {
  return { denied: code === "42501", error: code === "42501" ? "Pins are unavailable. Your permissions may have changed." : code === "P0001" ? "Please wait before changing pins again." : code === "22023" ? "This message cannot be pinned, or the channel has reached its 50-pin limit." : ["42883", "PGRST202"].includes(code ?? "") ? "Pins need the message interactions database update." : "Pins are unavailable. Please retry." };
}
export async function setMessagePin(input: unknown): Promise<ChatResult<ChatMessage>> {
  const p = z.strictObject({ id: z.uuid(), active: z.boolean() }).safeParse(input);
  if (!p.success) return { error: "Choose a valid message and pin action." };
  const { client } = await requireUser("/channels");
  try { const r = await client.rpc("set_message_pin", { p_message: p.data.id, p_active: p.data.active }); return r.error || !r.data ? failure(r.error?.code) : { data: r.data }; }
  catch { return failure(); }
}
export async function getPinnedMessages(channel: string): Promise<ChatResult<ChatMessage[]>> {
  if (!z.uuid().safeParse(channel).success) return { error: "Channel unavailable." };
  const { client } = await requireUser("/channels");
  try { const r = await client.rpc("channel_pinned_messages", { p_channel: channel }); return r.error ? failure(r.error.code) : { data: r.data ?? [] }; }
  catch { return failure(); }
}
