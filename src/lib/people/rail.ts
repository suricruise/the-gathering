"use server";
import { z } from "zod";
import { createClient } from "../supabase/server";
import type { Person, Result } from "./types";
export type MemberContact = Person & { community: string | null; self: boolean; can_request: boolean; can_message: boolean };
async function call<T>(name: string, args: Record<string, unknown>): Promise<Result<T>> {
  try {
    const client = await createClient();
    const identity = await client.auth.getUser();
    if (identity.error || !identity.data.user?.email_confirmed_at) return { error: "Sign in again to view members.", denied: true };
    const result = await client.rpc(name, args);
    if (result.error) return { error: ["PGRST202","42883"].includes(result.error.code) ? "Member lists need the latest database update." : "Members are unavailable. Please retry.", denied: result.error.code === "42501" };
    return result.data?.limited ? { error: "Please wait before trying again." } : { data: result.data };
  } catch { return { error: "Member services are unavailable. Check your connection and retry." }; }
}
export async function railMembers(input: unknown): Promise<Result<{ items: Person[] }>> {
  const parsed = z.strictObject({ channel: z.uuid().nullable().default(null), after: z.uuid().nullable().default(null) }).safeParse(input);
  if (!parsed.success) return { error: "Invalid member list." };
  return call("community_people_rail", { p_channel: parsed.data.channel, p_after: parsed.data.after });
}
export async function memberContact(target: unknown): Promise<Result<MemberContact>> {
  const parsed = z.uuid().safeParse(target);
  return parsed.success ? call("member_contact", { p_target: parsed.data }) : { error: "Member unavailable.", denied: true };
}
export async function communityPresence(share: unknown = null): Promise<Result<{ share: boolean }>> {
  const parsed = z.boolean().nullable().safeParse(share);
  return parsed.success ? call("community_presence_preference", { p_share: parsed.data }) : { error: "Invalid privacy preference." };
}
