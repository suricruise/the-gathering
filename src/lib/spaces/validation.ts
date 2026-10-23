import { z } from "zod";
const id = z.uuid();
const optionalId = id.nullable().default(null);
const clean = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(
      (v) =>
        [...v].every((c) => {
          const n = c.charCodeAt(0);
          return n === 9 || n === 10 || n === 13 || (n >= 32 && n !== 127);
        }),
      "Remove control characters.",
    );
const prayerFields = {
  body: clean(4000),
  visibility: z.enum(["community", "moderators"]),
};
const eventFields = {
  title: clean(100).min(3),
  description: clean(5000),
  kind: z.enum(["gaming", "voice", "discussion"]),
  banner: z.enum(["nebula", "aurora", "ember", "ocean"]),
  starts_local: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  ends_local: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  time_zone: z.string().min(1).max(80),
  session: optionalId,
  voice: optionalId,
};
export const preferencesFields = {
  friend_requests: z.boolean(),
  replies: z.boolean(),
  mentions: z.boolean(),
  community_invitations: z.boolean(),
  event_reminders: z.boolean(),
  event_updates: z.boolean(),
  gaming_invitations: z.boolean(),
  moderator_notices: z.boolean(),
  daily_content: z.boolean(),
};
export const spaceCommandSchema = z.discriminatedUnion("operation", [
  z.strictObject({
    operation: z.literal("prayer-create"),
    id,
    community: id,
    ...prayerFields,
    guidelines: z.literal(true),
  }),
  z.strictObject({
    operation: z.literal("prayer-edit"),
    prayer: id,
    ...prayerFields,
  }),
  z.strictObject({
    operation: z.literal("prayer-status"),
    prayer: id,
    status: z.enum(["open", "answered", "hidden", "removed"]),
    reason: z.string().trim().max(300).default(""),
  }),
  z.strictObject({
    operation: z.literal("prayer-comment"),
    prayer: id,
    id,
    body: clean(2000),
  }),
  z.strictObject({
    operation: z.literal("prayer-comment-remove"),
    prayer: id,
    comment: id,
  }),
  z.strictObject({
    operation: z.literal("prayer-encourage"),
    prayer: id,
    enabled: z.boolean(),
  }),
  z.strictObject({
    operation: z.literal("event-create"),
    id,
    community: id,
    ...eventFields,
  }),
  z.strictObject({ operation: z.literal("event-update"), id, ...eventFields }),
  z.strictObject({ operation: z.literal("event-cancel"), id }),
  z.strictObject({
    operation: z.literal("rsvp"),
    id,
    response: z.enum(["going", "interested", "declined", "withdraw"]),
  }),
  z.strictObject({ operation: z.literal("preferences"), ...preferencesFields }),
  z.strictObject({
    operation: z.literal("notifications-read"),
    id: z
      .string()
      .regex(/^[0-9]{1,18}$/)
      .optional(),
  }),
  z.strictObject({
    operation: z.literal("invite-community"),
    community: id,
    target: id,
  }),
  z.strictObject({
    operation: z.literal("invite-squad"),
    session: id,
    target: id,
  }),
  z.strictObject({
    operation: z.literal("notice-create"),
    id,
    community: id,
    target: id,
    body: clean(2000),
  }),
  z.strictObject({
    operation: z.enum([
      "accept-community",
      "decline-community",
      "accept-squad",
      "decline-squad",
    ]),
    id,
  }),
]);
export const readSchema = z.strictObject({
  view: z.enum([
    "context",
    "prayers",
    "prayer",
    "events",
    "event",
    "notifications",
    "notice",
    "recipients",
  ]),
  resource: optionalId,
  community: optionalId,
  before: z
    .string()
    .regex(/^[1-9][0-9]{0,17}$/)
    .nullable()
    .default(null),
  filter: z.enum(["all", "gaming", "voice", "discussion"]).default("all"),
});
export function localInZone(iso: string, zone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (s: string) => parts.find((p) => p.type === s)?.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
