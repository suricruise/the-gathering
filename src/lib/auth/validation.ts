import { z } from "zod";
export const emailSchema = z
  .email()
  .max(254)
  .transform((email) => email.trim().toLowerCase());
export const passwordSchema = z
  .string()
  .min(12, "Use at least 12 characters.")
  .max(128, "Use no more than 128 characters.");
export function eligibleAdult(input: string, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return false;
  const date = new Date(`${input}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== input)
    return false;
  const current = [
    now.getUTCFullYear(),
    now.getUTCMonth() + 1,
    now.getUTCDate(),
  ];
  const born = [
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  ];
  let age = current[0] - born[0];
  if (current[1] < born[1] || (current[1] === born[1] && current[2] < born[2]))
    age--;
  return age >= 18 && age <= 120;
}
export const registrationSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  dateOfBirth: z
    .string()
    .refine(
      (value) => eligibleAdult(value),
      "You must be at least 18 to join.",
    ),
  adultConsent: z.literal(true, { error: "Confirm that you are at least 18." }),
});
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});
export const interests = [
  "gaming", "movies-tv", "music", "books-comics", "technology", "sports", "food", "outdoors",
  "casual",
  "competitive",
  "co-op",
  "creative",
  "faith",
  "conversation",
  "events",
  "streaming",
] as const;
const reserved = new Set([
  "admin",
  "administrator",
  "support",
  "moderator",
  "the_gathering",
  "api",
  "auth",
  "settings",
  "deleted",
]);
export const profileSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z][a-z0-9_]{2,23}$/,
      "Use 3–24 lowercase letters, numbers, or underscores; start with a letter.",
    )
    .refine((value) => !reserved.has(value), "Please choose another username."),
  displayName: z.string().trim().min(1).max(60),
  bio: z.string().trim().max(500),
  visibility: z.enum(["private", "members", "public"]),
  interests: z.array(z.enum(interests)).max(16),
  games: z.array(z.string().regex(/^[a-z0-9-]{1,50}$/)).max(12),
  platforms: z.array(z.string().regex(/^[a-z0-9-]{1,50}$/)).max(5),
});
export function safeNext(input: unknown, fallback = "/home") {
  if (
    typeof input !== "string" ||
    !/^\/(?:home|onboarding|reset-password|profile|settings|channels|voice|communities|squad-up|feed|events|faith|faith-circles|messages|members)(?:\/[a-zA-Z0-9_-]{1,64})*$/.test(
      input,
    )
  )
    return fallback;
  return input;
}
export function formText(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
}
