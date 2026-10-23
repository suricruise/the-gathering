import { z } from "zod";
const id = z.uuid();
const optional = id.nullable().default(null);
const text = (max: number, min = 1) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine(
      (v) =>
        ![...v].some((c) => {
          const n = c.charCodeAt(0);
          return (n < 32 && ![9, 10, 13].includes(n)) || n === 127;
        }),
      "Remove control characters.",
    );
const scope = { community_id: id };
const reason = { reason: text(500, 5) };
const command = <T extends z.ZodRawShape>(operation: string, fields: T) =>
  z.strictObject({ operation: z.literal(operation), ...reason, ...fields });
// Roles are an explicit allowlist; owner is provisioned only by a trusted SQL operator.
export const adminCommandSchema = z.discriminatedUnion("operation", [
  command("platform_role", {
    user_id: id,
    role: z.enum(["administrator", "moderator", "member"]),
  }),
  command("account_status", {
    user_id: id,
    status: z.enum(["active", "suspended", "banned"]),
    days: z.number().int().min(1).max(365).default(7),
  }),
  command("community", {
    community_id: optional,
    user_id: optional,
    slug: z.string().regex(/^[a-z][a-z0-9-]{2,47}$/),
    name: text(80, 3),
    description: z.string().max(2000),
    visibility: z.enum(["public", "discoverable", "private"]),
    archived: z.boolean(),
  }),
  command("community_settings", {
    ...scope,
    guidelines: text(3000, 5),
    allow_events: z.boolean(),
    allow_prayers: z.boolean(),
  }),
  command("community_role", {
    ...scope,
    user_id: id,
    role: z.enum(["administrator", "moderator", "member"]),
  }),
  command("community_status", {
    ...scope,
    user_id: id,
    status: z.enum(["active", "banned"]),
  }),
  command("channel", {
    ...scope,
    id: optional,
    name: z.string().regex(/^[a-z0-9][a-z0-9-]{0,47}$/),
    description: z.string().max(1000),
    kind: z.enum(["text", "voice"]),
    is_private: z.boolean(),
    position: z.number().int().min(0).max(999),
    disabled: z.boolean(),
  }),
  command("channel_access", {
    ...scope,
    id,
    role: z.enum(["member", "moderator", "administrator"]),
    can_view: z.boolean(),
    can_post: z.boolean(),
    can_connect: z.boolean(),
    reset: z.boolean(),
  }),
  command("voice_remove", { ...scope, id, user_id: id }),
  command("event_visibility", { ...scope, id, hidden: z.boolean() }),
  command("announcement", {
    community_id: optional,
    id: optional,
    title: text(100, 3),
    body: text(3000),
    published: z.boolean(),
    expires_at: z.iso.datetime({ offset: true }),
  }),
  command("retention", { days: z.number().int().min(7).max(365) }),
  command("case_decision", {
    id,
    decision: z.enum(["dismissed", "actioned"]),
    remove: z.boolean(),
  }),
  command("appeal_lodge", { user_id: id, body: text(2000, 10) }),
  command("appeal_decision", {
    id,
    decision: z.enum(["accepted", "declined"]),
  }),
]);
export const adminReadSchema = z.strictObject({
  view: z.enum([
    "context",
    "overview",
    "members",
    "reports",
    "audit",
    "appeals",
    "communities",
    "channels",
    "events",
    "announcements",
  ]),
  community: optional,
  before: z.number().int().positive().safe().nullable().default(null),
  search: z.string().max(48).default(""),
});
export const reportSchema = z.strictObject({
  type: z.enum(["message", "post", "user", "session"]),
  target: id,
  reason: text(1000, 5),
});
export const appealSchema = z.strictObject({
  body: text(2000, 10),
  case_id: optional,
});
