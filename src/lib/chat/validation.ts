import { z } from "zod";
import { reactionEmoji } from "./types";
export function hasUnsafeControls(text: string) {
  return Array.from(text).some((c) => {
    const n = c.charCodeAt(0);
    return n < 32 && ![9, 10, 13].includes(n);
  });
}

export const idSchema = z.uuid();
export const seqSchema = z
  .string()
  .regex(/^\d{1,19}$/)
  .refine((s) => BigInt(s) <= 9223372036854775807n);
export const bodySchema = z
  .string()
  .max(4000)
  .refine((s) => !hasUnsafeControls(s), "Remove control characters.");
export const sendSchema = z
  .object({
    id: idSchema,
    channelId: idSchema,
    body: bodySchema,
    parentId: idSchema.nullable(),
    replyToId: idSchema.nullable(),
    attachments: z.array(idSchema).max(4),
  })
  .strict()
  .refine(
    (v) => !!v.body.trim() || v.attachments.length > 0,
    "Write a message or attach a file.",
  );
export const changeSchema = z
  .object({
    id: idSchema,
    operation: z.enum(["edit", "delete"]),
    body: bodySchema.default(""),
    reason: z.string().max(300).default(""),
  })
  .strict()
  .refine((v) => v.operation !== "edit" || !!v.body.trim(), "Write a message.");
export const reactionSchema = z
  .object({ id: idSchema, emoji: z.enum(reactionEmoji), active: z.boolean() })
  .strict();
export const pageSchema = z
  .object({
    channelId: idSchema,
    parentId: idSchema.nullable().default(null),
    before: seqSchema.nullable().default(null),
    search: z.string().trim().min(2).max(100).nullable().default(null),
  })
  .strict();
export function safeHref(value: string) {
  try {
    if (Array.from(value).some((c) => c.charCodeAt(0) < 32)) return undefined;
    const u = new URL(value);
    if (
      !["http:", "https:"].includes(u.protocol) ||
      u.username ||
      u.password ||
      value.length > 2048
    )
      return undefined;
    return u.href;
  } catch {
    return undefined;
  }
}
export function messageLinks(body: string) {
  return [
    ...new Set(
      (body.match(/https?:\/\/[^\s<>"]+/g) ?? [])
        .map((s) => s.replace(/[),.!?;\]]+$/, ""))
        .map(safeHref)
        .filter((s): s is string => !!s),
    ),
  ].slice(0, 3);
}

// A narrow internal study route, never an arbitrary relative URL or redirect.
export function safeStudyHref(value: string) {
  const m = /^\/faith-circles\/([^/]+)\/studies\/([^/]+)\/sessions\/([^/]+)$/.exec(value);
  return m && m.slice(1).every(part => idSchema.safeParse(part).success) ? value : undefined;
}
