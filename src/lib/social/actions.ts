"use server";
import { z } from "zod";
import { requireUser } from "../auth/session";
import { createAdminClient } from "../supabase/admin";
import { fetchLinkPreview } from "../chat/previews";
import { messageLinks, seqSchema } from "../chat/validation";
import { commandSchema, cursorSchema, filtersSchema } from "./validation";
import type {
  SocialPost,
  SocialPage,
  SocialComment,
  SocialReport,
  SocialResult,
} from "./types";
function failure(error: { code?: string } | null): { error: string } {
  return {
    error:
      error?.code === "42501"
        ? "This content or action is unavailable. Your access may have changed."
        : "The change could not be saved. Check your entries and permissions, then retry.",
  };
}
export async function socialCommand(
  input: unknown,
): Promise<SocialResult<{ id?: string; ok?: boolean }>> {
  const parsed = commandSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { client } = await requireUser("/feed");
  const { operation, ...data } = parsed.data;
  const category =
    (
      {
        create: "post",
        comment: "comment",
        react: "reaction",
        follow: "follow",
        report: "report",
        moderate: "moderate",
      } as Record<string, string>
    )[operation] ?? "mutate";
  try {
    const budget = await client.rpc("social_budget", { p_operation: category });
    if (budget.error)
      return {
        error:
          "Social sharing is unavailable. An administrator may need to apply the social migrations.",
      };
    if (budget.data !== true)
      return { error: "Please wait before trying this again." };
    const result = await client.rpc("social_command", {
      p_operation: operation,
      p_data: data,
    });
    if (result.error) return failure(result.error);
    if (result.data?.limited)
      return { error: "Please wait before trying this again." };
    return { data: result.data };
  } catch {
    return failure(null);
  }
}
export async function getSocialFeed(
  input: unknown,
): Promise<SocialResult<SocialPage<SocialPost>>> {
  const parsed = filtersSchema.safeParse(input);
  if (!parsed.success) return { error: "Choose valid feed filters." };
  const { client } = await requireUser("/feed");
  const v = parsed.data;
  const result = await client.rpc("social_feed", {
    p_mode: v.mode,
    p_community: v.community,
    p_interest: v.interest,
    p_author: v.author,
    p_before: v.before,
  });
  return result.error ? failure(result.error) : { data: result.data };
}
export async function getSocialPost(
  id: string,
): Promise<SocialResult<SocialPost>> {
  if (!z.uuid().safeParse(id).success) return { error: "Post unavailable." };
  const { client } = await requireUser("/feed");
  const result = await client.rpc("social_post", { p_id: id });
  return result.error || !result.data
    ? {
        error:
          "Post unavailable. It may be private, removed, or no longer accessible.",
      }
    : { data: result.data };
}
export async function getSocialComments(
  input: unknown,
): Promise<SocialResult<SocialPage<SocialComment>>> {
  const parsed = cursorSchema.safeParse(input);
  if (!parsed.success) return { error: "Comments unavailable." };
  const { client } = await requireUser("/feed");
  const r = await client.rpc("social_comments", {
    p_post: parsed.data.id,
    p_before: parsed.data.before,
  });
  return r.error ? failure(r.error) : { data: r.data };
}
export async function getSocialReports(
  input: unknown,
): Promise<SocialResult<SocialPage<SocialReport>>> {
  const parsed = z
    .object({ mine: z.boolean(), before: seqSchema.nullable() })
    .strict()
    .safeParse(input);
  if (!parsed.success) return { error: "Reports unavailable." };
  const { client } = await requireUser("/feed");
  const r = await client.rpc("social_report_page", {
    p_mine: parsed.data.mine,
    p_before: parsed.data.before,
  });
  return r.error ? failure(r.error) : { data: r.data };
}
export async function socialPreviews(
  id: string,
): Promise<SocialResult<SocialPost>> {
  const current = await getSocialPost(id);
  if (!current.data || current.data.status !== "published")
    return { error: "Post unavailable." };
  const { client } = await requireUser("/feed");
  const budget = await client.rpc("social_budget", { p_operation: "preview" });
  if (budget.error || !budget.data)
    return { error: "Please wait before loading another preview." };
  let saved = 0;
  for (const url of messageLinks(current.data.body)) {
    try {
      const preview = await fetchLinkPreview(url);
      const r = await createAdminClient().rpc("store_post_preview", {
        p_post: id,
        p_body: current.data.body,
        p_url: url,
        p_title: preview.title,
        p_description: preview.description,
        p_hostname: preview.hostname,
      });
      if (!r.error && r.data === true) saved++;
    } catch {
      /* Unsafe/unreachable destinations remain ordinary links. */
    }
  }
  return saved
    ? getSocialPost(id)
    : {
        error:
          "A preview could not be loaded safely. The original link is still available.",
      };
}
