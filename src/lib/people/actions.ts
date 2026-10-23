"use server";
import { createClient } from "../supabase/server";
async function verifiedClient() {
  const client = await createClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  return error || !user?.email_confirmed_at ? null : client;
}
import { peopleCommandSchema, searchSchema, historySchema } from "./validation";
import type { Result, PeopleHome, History, Person } from "./types";
function failure(code?: string) {
  return {
    error:
      code === "42501"
        ? "This member or conversation is unavailable. Your access may have changed."
        : "People and messages are unavailable. Please retry; an administrator may need to apply Phase 9 migrations.",
    denied: code === "42501",
  };
}
export async function peopleCommand(
  input: unknown,
): Promise<Result<{ id?: string; ok?: boolean }>> {
  const p = peopleCommandSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0].message };
  const client = await verifiedClient();
  if (!client)
    return { error: "Sign in again to use people and messages.", denied: true };
  const { operation, ...data } = p.data;
  // Committed request budget also accounts for rejected transactions.
  const budget = await client.rpc("people_budget", { p_operation: "control" });
  if (budget.error) return failure();
  if (!budget.data) return { error: "Please wait before trying again." };
  const r = await client.rpc("people_command", {
    p_operation: operation,
    p_data: data,
  });
  return r.error
    ? failure(r.error.code)
    : r.data?.limited
      ? { error: "Please wait before trying again." }
      : { data: r.data };
}
export async function getPeople(): Promise<Result<PeopleHome>> {
  const client = await verifiedClient();
  if (!client)
    return { error: "Sign in again to use people and messages.", denied: true };
  const r = await client.rpc("people_home");
  return r.error ? failure(r.error.code) : { data: r.data };
}
export async function searchPeople(
  input: unknown,
): Promise<Result<{ items: Person[] }>> {
  const p = searchSchema.safeParse(input);
  if (!p.success)
    return {
      error: "Enter 2–24 username characters: letters, numbers or underscores.",
    };
  const client = await verifiedClient();
  if (!client)
    return { error: "Sign in again to use people and messages.", denied: true };
  const r = await client.rpc("people_search", {
    p_query: p.data.query,
    p_before: p.data.before,
  });
  return r.error
    ? failure(r.error.code)
    : r.data?.limited
      ? { error: "Please wait before searching again." }
      : { data: r.data };
}
export async function directHistory(input: unknown): Promise<Result<History>> {
  const p = historySchema.safeParse(input);
  if (!p.success) return { error: "Conversation unavailable.", denied: true };
  const client = await verifiedClient();
  if (!client)
    return { error: "Sign in again to use people and messages.", denied: true };
  const r = await client.rpc("dm_history", {
    p_conversation: p.data.conversation,
    p_before: p.data.before,
  });
  return r.error ? failure(r.error.code) : { data: r.data };
}
