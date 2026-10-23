import { z } from "zod";
import { hasUnsafeControls, seqSchema } from "../chat/validation";
const id = z.uuid(),
  slug = z.string().regex(/^[a-z0-9-]{1,50}$/);
const text = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine(
      (s) => !hasUnsafeControls(s) && !s.includes("\u007f"),
      "Remove control characters.",
    );
export const commandSchema = z.discriminatedUnion("operation", [
  z
    .object({
      operation: z.literal("create"),
      id,
      title: text(3, 80),
      description: text(1, 2000),
      game: slug,
      platform: slug,
      cross_play: z.boolean(),
      style: z.enum(["casual", "competitive"]),
      max_players: z.number().int().min(2).max(50),
      approval: z.boolean(),
      visibility: z.enum(["public", "friends", "community"]),
      community: id.nullable(),
      game_night: z.boolean(),
      starts_at: z.iso.datetime({ offset: true }).nullable(),
    })
    .strict()
    .refine(
      (v) =>
        (v.visibility === "community") === !!v.community &&
        (!v.game_night || v.visibility === "community"),
      "Choose a matching audience and community.",
    ),
  z
    .object({ operation: z.literal("join"), session: id, platform: slug })
    .strict(),
  ...(["withdraw", "cancel", "block-host"] as const).map((operation) =>
    z.object({ operation: z.literal(operation), session: id }).strict(),
  ),
  ...(["approve", "reject", "remove", "block-member"] as const).map(
    (operation) =>
      z
        .object({ operation: z.literal(operation), session: id, target: id })
        .strict(),
  ),
  z.object({ operation: z.literal("unblock"), target: id }).strict(),
]);
export const filtersSchema = z
  .object({
    mode: z.enum(["discover", "mine", "game-nights"]).default("discover"),
    game: slug.nullable().default(null),
    platform: slug.nullable().default(null),
    slots: z.number().int().min(0).max(49).default(0),
    when: z.enum(["any", "now", "day", "week", "scheduled"]).default("any"),
    style: z.enum(["casual", "competitive"]).nullable().default(null),
    community: id.nullable().default(null),
    before: seqSchema.nullable().default(null),
  })
  .strict();
export type SquadFilters = z.infer<typeof filtersSchema>;
