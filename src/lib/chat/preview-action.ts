"use server";
import { requireUser } from "../auth/session";
import { createAdminClient } from "../supabase/admin";
import { fetchLinkPreview } from "./previews";
import { idSchema, messageLinks } from "./validation";
import type { ChatMessage, ChatResult } from "./types";
export async function loadLinkPreviews(
  id: string,
): Promise<ChatResult<ChatMessage>> {
  if (!idSchema.safeParse(id).success) return { error: "Message unavailable." };
  const { client } = await requireUser("/channels");
  const current = await client.rpc("chat_message", { p_id: id });
  if (current.error || !current.data || current.data.deleted_at)
    return { error: "Message unavailable." };
  const message = current.data as ChatMessage;
  const budget = await client.rpc("chat_preview_budget", { p_message: id });
  if (budget.error || !budget.data)
    return { error: "Please wait before loading another preview." };
  let saved = 0;
  for (const url of messageLinks(message.body)) {
    if (message.previews.some((p) => p.url === url)) {
      saved++;
      continue;
    }
    try {
      const preview = await fetchLinkPreview(url);
      const result = await createAdminClient().rpc("store_message_preview", {
        p_message: id,
        p_url: preview.url,
        p_title: preview.title,
        p_description: preview.description,
        p_hostname: preview.hostname,
      });
      if (!result.error && result.data === true) saved++;
    } catch {
      /* Untrusted/unavailable URLs remain ordinary links. */
    }
  }
  const refreshed = await client.rpc("chat_message", { p_id: id });
  return saved && refreshed.data
    ? { data: refreshed.data as ChatMessage }
    : {
        error:
          "A preview could not be loaded safely. You can still open the original link.",
      };
}
