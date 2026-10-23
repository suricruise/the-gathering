import { z } from "zod";
const uuid = z.uuid();
const optionalId = z.union([uuid, z.literal("")]).optional();
const name = z.string().trim().min(3).max(80);
const visibility = z.enum(["public", "discoverable", "private"]);
const cover = z.enum(["nebula", "aurora", "ember", "ocean"]);
export const communitySettings = z
  .object({ name, description: z.string().trim().max(2000), visibility, cover })
  .strict();
export const commandSchema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("create"),
    data: communitySettings.extend({
      slug: z.string().regex(/^[a-z][a-z0-9-]{2,47}$/),
    }),
  }),
  z.object({ operation: z.literal("settings"), data: communitySettings }),
  ...["join", "leave", "invite"].map((operation) =>
    z.object({ operation: z.literal(operation), data: z.object({}).strict() }),
  ),
  z.object({
    operation: z.literal("accept_invite"),
    data: z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  }),
  z.object({
    operation: z.enum(["kick", "ban", "unban", "transfer"]),
    data: z.object({ user_id: uuid }).strict(),
  }),
  z.object({
    operation: z.literal("role"),
    data: z
      .object({
        user_id: uuid,
        role: z.enum(["administrator", "moderator", "member"]),
      })
      .strict(),
  }),
  z.object({
    operation: z.literal("category"),
    data: z
      .object({
        id: optionalId,
        name: z.string().trim().min(1).max(60),
        position: z.coerce.number().int().min(0).max(999),
      })
      .strict(),
  }),
  z.object({
    operation: z.literal("channel"),
    data: z
      .object({
        id: optionalId,
        category_id: optionalId,
        name: z.string().regex(/^[a-z0-9][a-z0-9-]{0,47}$/),
        description: z.string().trim().max(1000),
        kind: z.enum(["text", "voice"]),
        is_private: z.boolean(),
        position: z.coerce.number().int().min(0).max(999),
      })
      .strict(),
  }),
  z.object({
    operation: z.literal("override"),
    data: z
      .object({
        channel_id: uuid,
        user_id: optionalId,
        role: z
          .union([
            z.enum(["owner", "administrator", "moderator", "member"]),
            z.literal(""),
          ])
          .optional(),
        can_view: z.boolean(),
        can_post: z.boolean(),
        can_connect: z.boolean(),
        reset: z.boolean(),
      })
      .strict()
      .refine(
        (v) => Boolean(v.user_id) !== Boolean(v.role),
        "Choose a member or a role.",
      ),
  }),
  z.object({
    operation: z.literal("revoke_invite"),
    data: z.object({ id: uuid }).strict(),
  }),
]);
export function parseCommand(form: FormData) {
  const operation = String(form.get("operation") ?? "");
  const data: Record<string, unknown> = {};
  for (const [key, value] of form.entries()) {
    if (
      key === "operation" ||
      key === "community_id" ||
      key.startsWith("$ACTION_")
    )
      continue;
    if (typeof value !== "string") return null;
    if (key in data) return null;
    data[key] = value;
  }
  if (operation === "channel") data.is_private = data.is_private === "on";
  if (operation === "override") {
    // Do not name a form control `reset`: it shadows HTMLFormElement.reset().
    for (const key of ["can_view", "can_post", "can_connect"])
      data[key] = data[key] === "on";
    data.reset = data.reset_override === "on";
    delete data.reset_override;
  }
  const parsed = commandSchema.safeParse({ operation, data });
  const id = uuid.safeParse(form.get("community_id"));
  if (
    !parsed.success ||
    (!["create", "accept_invite"].includes(operation) && !id.success)
  )
    return null;
  return { command: parsed.data, communityId: id.success ? id.data : null };
}
