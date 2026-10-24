"use server";
import { requireUser } from "../auth/session";
import {
  sendSchema,
  changeSchema,
  reactionSchema,
  pageSchema,
  idSchema,
  seqSchema,
} from "./validation";
import type { ChatMessage, ChatPage, ChatResult } from "./types";
function failure(error: { code?: string } | null): ChatResult<never> {
  return {
    error:
      error?.code === "42501"
        ? "This channel or message is unavailable. Your permissions may have changed."
        : error?.code === "P0001"
          ? "Please wait before trying again."
          : error?.code === "22023"
            ? "Check your message and try again."
            : "Messaging is temporarily unavailable. Please retry.",
    denied: error?.code === "42501",
  };
}
export async function sendMessage(
  input: unknown,
): Promise<ChatResult<ChatMessage>> {
  const p = sendSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0].message, delivery: "not_sent" };
  const { client } = await requireUser("/channels");
  const v = p.data;
  try {
    const { data: id, error } = await client.rpc("send_channel_message", {
      p_id: v.id,
      p_channel: v.channelId,
      p_body: v.body,
      p_parent: v.parentId,
      p_reply_to: v.replyToId,
      p_attachments: v.attachments,
    });
    if (error) return { ...failure(error), delivery: ["42501", "P0001", "22023"].includes(error.code) ? "not_sent" : "unconfirmed" };
    const result = await client.rpc("chat_message", { p_id: id });
    if (result.error || !result.data) return { ...failure(result.error), delivery: "unconfirmed" };
    return { data: result.data as ChatMessage, delivery: "sent" };
  } catch {
    return { ...failure(null), delivery: "unconfirmed" };
  }
}
export async function changeMessage(
  input: unknown,
): Promise<ChatResult<ChatMessage>> {
  const p = changeSchema.safeParse(input);
  if (!p.success) return { error: "Check the message and reason." };
  const { client } = await requireUser("/channels");
  const v = p.data;
  try {
    const { error } = await client.rpc("change_channel_message", {
      p_id: v.id,
      p_operation: v.operation,
      p_body: v.body,
      p_reason: v.reason,
    });
    if (error) return failure(error);
    const result = await client.rpc("chat_message", { p_id: v.id });
    return result.error || !result.data
      ? failure(result.error)
      : { data: result.data as ChatMessage };
  } catch {
    return failure(null);
  }
}
export async function reactToMessage(
  input: unknown,
): Promise<ChatResult<ChatMessage>> {
  const p = reactionSchema.safeParse(input);
  if (!p.success) return { error: "Choose an available reaction." };
  const { client } = await requireUser("/channels");
  try {
    const { error } = await client.rpc("set_message_reaction", {
      p_message: p.data.id,
      p_emoji: p.data.emoji,
      p_active: p.data.active,
    });
    if (error) return failure(error);
    const result = await client.rpc("chat_message", { p_id: p.data.id });
    return result.error || !result.data
      ? failure(result.error)
      : { data: result.data as ChatMessage };
  } catch {
    return failure(null);
  }
}
export async function getMessage(id: string): Promise<ChatResult<ChatMessage>> {
  if (!idSchema.safeParse(id).success) return { error: "Message unavailable." };
  const { client } = await requireUser("/channels");
  try {
    const { data, error } = await client.rpc("chat_message", { p_id: id });
    return error || !data
      ? failure(error ?? { code: "42501" })
      : { data: data as ChatMessage };
  } catch {
    return failure(null);
  }
}
export async function getHistory(
  input: unknown,
): Promise<ChatResult<ChatPage>> {
  const p = pageSchema.safeParse(input);
  if (!p.success) return { error: "Invalid history request." };
  const { client } = await requireUser("/channels");
  try {
    const { data, error } = await client.rpc("chat_page", {
      p_channel: p.data.channelId,
      p_parent: p.data.parentId,
      p_before: p.data.before,
      p_search: p.data.search,
    });
    return error ? failure(error) : { data: data as ChatPage };
  } catch {
    return failure(null);
  }
}
export async function getChanges(
  channelId: string,
  after: string,
): Promise<ChatResult<ChatMessage[]>> {
  if (
    !idSchema.safeParse(channelId).success ||
    !seqSchema.safeParse(after).success
  )
    return { error: "Invalid catch-up request." };
  const { client } = await requireUser("/channels");
  try {
    const { data, error } = await client.rpc("chat_changes", {
      p_channel: channelId,
      p_after: after,
    });
    return error ? failure(error) : { data: data as ChatMessage[] };
  } catch {
    return failure(null);
  }
}
export async function markRead(
  channelId: string,
  messageId: string,
): Promise<ChatResult<boolean>> {
  if (
    !idSchema.safeParse(channelId).success ||
    !idSchema.safeParse(messageId).success
  )
    return { error: "Invalid read marker." };
  const { client } = await requireUser("/channels");
  try {
    const { data, error } = await client.rpc("mark_channel_read", {
      p_channel: channelId,
      p_message: messageId,
    });
    return error ? failure(error) : { data: data === true };
  } catch {
    return failure(null);
  }
}
export async function sendTyping(channelId: string, active: boolean) {
  if (!idSchema.safeParse(channelId).success || typeof active !== "boolean")
    return false;
  const { client } = await requireUser("/channels");
  try {
    const { data, error } = await client.rpc("chat_typing", {
      p_channel: channelId,
      p_active: active,
    });
    return !error && data === true;
  } catch {
    return false;
  }
}
