"use server";
import { createClient } from "../supabase/server";
import {
  adminCommandSchema,
  adminReadSchema,
  reportSchema,
  appealSchema,
} from "./validation";
export type Result<T = unknown> = { data?: T; error?: string };
async function verified() {
  const client = await createClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  return !error && user?.email_confirmed_at ? client : null;
}
function failure(code?: string) {
  return code === "42501"
    ? "You do not have permission for this action. Your role may have changed."
    : code === "23505"
      ? "This record already exists. Check the name or pending request."
      : code === "22023" || code === "23514"
        ? "Check the details and try again."
        : "Administration is unavailable. Check Phase 11 setup or retry.";
}
export async function adminRead(input: unknown): Promise<Result> {
  const p = adminReadSchema.safeParse(input);
  if (!p.success) return { error: "Invalid filters." };
  const c = await verified();
  if (!c) return { error: "Sign in again to continue." };
  const r = await c.rpc("admin_read", {
    p_view: p.data.view,
    p_community: p.data.community,
    p_before: p.data.before,
    p_search: p.data.search,
  });
  return r.error ? { error: failure(r.error.code) } : { data: r.data };
}
export async function adminCommand(input: unknown): Promise<Result> {
  const p = adminCommandSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0].message };
  const c = await verified();
  if (!c) return { error: "Sign in again to continue." };
  const { operation, ...data } = p.data;
  const r = await c.rpc("admin_command", {
    p_operation: operation,
    p_data: data,
  });
  return r.error ? { error: failure(r.error.code) } : { data: r.data };
}
export async function submitReport(input: unknown): Promise<Result> {
  const p = reportSchema.safeParse(input);
  if (!p.success)
    return { error: "Enter a valid target and a reason of 5–1000 characters." };
  const c = await verified();
  if (!c) return { error: "Sign in again to continue." };
  const r = await c.rpc("submit_report", {
    p_type: p.data.type,
    p_target: p.data.target,
    p_reason: p.data.reason,
  });
  return r.error ? { error: failure(r.error.code) } : { data: r.data };
}
export async function submitAppeal(input: unknown): Promise<Result> {
  const p = appealSchema.safeParse(input);
  if (!p.success)
    return { error: "Explain your appeal in 10–2000 characters." };
  const c = await verified();
  if (!c)
    return {
      error:
        "Sign in again to continue. If your account is restricted, use the operator appeal process described on this page.",
    };
  const r = await c.rpc("submit_appeal", {
    p_body: p.data.body,
    p_case: p.data.case_id,
  });
  return r.error ? { error: failure(r.error.code) } : { data: r.data };
}
export async function memberAnnouncements(): Promise<
  Result<Array<{ id: string; title: string; body: string }>>
> {
  const c = await verified();
  if (!c) return { error: "Sign in again to continue." };
  const r = await c
    .from("site_announcements")
    .select("id,title,body")
    .order("updated_at", { ascending: false })
    .limit(5);
  return r.error ? { error: "Announcements unavailable." } : { data: r.data };
}
