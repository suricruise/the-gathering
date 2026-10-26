import { z } from "zod";
import { socialInterests as interests } from "./interests";
import { hasUnsafeControls, seqSchema } from "../chat/validation";
export const reactions = ["👍", "❤️", "😂", "🎉", "🙏", "🔥"] as const;
export const reasons = [
  "harassment",
  "hate",
  "sexual",
  "violence",
  "spam",
  "privacy",
  "other",
] as const;
const id = z.uuid(),
  text = (max: number) =>
    z
      .string()
      .max(max)
      .refine(
        (s) => !hasUnsafeControls(s) && !s.includes("\u007f"),
        "Remove control characters.",
      );
export const filtersSchema = z
  .object({
    mode: z
      .enum(["for-you", "explore", "following", "mine"])
      .default("for-you"),
    community: id.nullable().default(null),
    interest: z.enum(interests).nullable().default(null),
    author: id.nullable().default(null),
    before: seqSchema.nullable().default(null),
  })
  .strict();
export const commandSchema = z.discriminatedUnion("operation", [
  z
    .object({
      operation: z.literal("create"),
      id,
      body: text(5000),
      audience: z.enum(["members", "followers", "community", "private"]),
      community: id.nullable(),
      games: z.array(z.string().regex(/^[a-z0-9-]{1,50}$/)).max(4),
      interests: z.array(z.enum(interests)).max(4),
      media: z.array(id).max(4),
    })
    .strict()
    .refine(
      (v) =>
        (v.audience === "community") === !!v.community &&
        (!!v.body.trim() || v.media.length > 0),
      "Choose an audience and add text or media.",
    ),
  z
    .object({ operation: z.literal("edit"), post: id, body: text(5000) })
    .strict(),
  z.object({ operation: z.literal("delete"), post: id }).strict(),
  z
    .object({
      operation: z.literal("react"),
      post: id,
      emoji: z.enum(reactions),
      active: z.boolean(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("comment"),
      id,
      post: id,
      body: text(2000).refine((s) => !!s.trim()),
    })
    .strict(),
  z
    .object({
      operation: z.literal("edit-comment"),
      comment: id,
      post: id,
      body: text(2000).refine((s) => !!s.trim()),
    })
    .strict(),
  z
    .object({ operation: z.literal("delete-comment"), comment: id, post: id })
    .strict(),
  z
    .object({ operation: z.literal("follow"), target: id, active: z.boolean() })
    .strict(),
  z
    .object({
      operation: z.literal("report"),
      post: id,
      comment: id.nullable(),
      reason: z.enum(reasons),
      detail: text(500),
    })
    .strict(),
  z
    .object({
      operation: z.literal("moderate"),
      report: id,
      decision: z.enum(["dismiss", "hide", "remove", "restore"]),
    })
    .strict(),
]);
export const cursorSchema = z
  .object({ id, before: seqSchema.nullable().default(null) })
  .strict();
export function clipLink(value: string) {
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" || u.username || u.password || u.port)
      return null;
    let label: string | undefined;
    if (
      ["youtube.com", "www.youtube.com", "m.youtube.com"].includes(
        u.hostname,
      ) &&
      ((u.pathname === "/watch" &&
        /^[\w-]{11}$/.test(u.searchParams.get("v") ?? "")) ||
        /^\/(shorts|clip)\/[\w-]{6,100}$/.test(u.pathname))
    )
      label = "YouTube video";
    if (u.hostname === "youtu.be" && /^\/[\w-]{11}$/.test(u.pathname))
      label = "YouTube video";
    if (u.hostname === "clips.twitch.tv" && /^\/[\w-]{4,100}$/.test(u.pathname))
      label = "Twitch clip";
    if (
      ["www.twitch.tv", "twitch.tv"].includes(u.hostname) &&
      /^\/[a-zA-Z0-9_]{1,25}\/clip\/[\w-]{4,100}$/.test(u.pathname)
    )
      label = "Twitch clip";
    return label ? { url: u.href, label } : null;
  } catch {
    return null;
  }
}
