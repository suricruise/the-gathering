import { z } from "zod";
export function publicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  const parsed = z.url().safeParse(url);
  if (!parsed.success) return null;
  const target = new URL(url);
  if (
    target.username ||
    target.password ||
    !["http:", "https:"].includes(target.protocol)
  )
    return null;
  if (
    process.env.NODE_ENV === "production" &&
    target.protocol !== "https:" &&
    !["localhost", "127.0.0.1"].includes(target.hostname)
  )
    return null;
  return { url, key };
}
export function appOrigin() {
  const configured = process.env.APP_URL;
  if (!configured && process.env.NODE_ENV === "production")
    throw new Error("APP_URL is required");
  const url = new URL(configured || "http://127.0.0.1:3000");
  if (
    url.username ||
    url.password ||
    !["https:", "http:"].includes(url.protocol) ||
    (process.env.NODE_ENV === "production" &&
      url.protocol !== "https:" &&
      !["127.0.0.1", "localhost"].includes(url.hostname))
  )
    throw new Error("Invalid APP_URL");
  return url.origin;
}
export function authConfigured() {
  return Boolean(publicConfig() && process.env.SUPABASE_SECRET_KEY);
}
