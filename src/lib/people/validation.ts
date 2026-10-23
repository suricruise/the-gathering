import { z } from "zod";
const id = z.uuid();
const sequence = z.string().regex(/^[0-9]{1,18}$/);
const body = z
  .string()
  .trim()
  .min(1)
  .max(4000)
  .refine(
    // eslint-disable-next-line no-control-regex -- Reject unsafe C0 controls in stored text.
    (v) => !/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(v),
    "Remove control characters.",
  );
const targeted = [
  "request",
  "accept",
  "decline",
  "cancel",
  "remove",
  "block",
  "unblock",
  "open",
] as const;
export const peopleCommandSchema = z.discriminatedUnion("operation", [
  z.strictObject({ operation: z.enum(targeted), target: id }),
  z.strictObject({
    operation: z.literal("privacy"),
    discoverable: z.boolean(),
    allow_requests: z.boolean(),
    dm_policy: z.enum(["friends", "members", "nobody"]),
    share_presence: z.boolean(),
  }),
  z.strictObject({ operation: z.literal("send"), conversation: id, id, body }),
  z.strictObject({
    operation: z.literal("read"),
    conversation: id,
    seq: sequence,
  }),
  z.strictObject({
    operation: z.literal("mute"),
    conversation: id,
    muted: z.boolean(),
  }),
  z.strictObject({
    operation: z.literal("report"),
    conversation: id,
    message: id,
    reason: z.string().trim().min(5).max(1000),
  }),
  z.strictObject({ operation: z.literal("heartbeat") }),
  z.strictObject({ operation: z.literal("notifications-read") }),
]);
export const searchSchema = z.strictObject({
  query: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^(?:[a-z0-9_]{2,24})?$/)
    .default(""),
  before: z
    .string()
    .regex(/^[a-z][a-z0-9_]{2,23}$/)
    .nullable()
    .default(null),
});
export const historySchema = z.strictObject({
  conversation: id,
  before: sequence.nullable().default(null),
});
export function mergeDirectMessages(
  previous: import("./types").DirectMessage[],
  incoming: import("./types").DirectMessage[],
) {
  return [
    ...new Map([...previous, ...incoming].map((m) => [m.id, m])).values(),
  ].sort((a, b) => (BigInt(a.seq) < BigInt(b.seq) ? -1 : 1));
}
