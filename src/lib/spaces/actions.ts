"use server";
import { createClient } from "../supabase/server";
import { spaceCommandSchema } from "./validation";
import type { Result } from "./types";
export async function spaceCommand(
  input: unknown,
): Promise<Result<{ id?: string; href?: string; ok?: boolean }>> {
  const p = spaceCommandSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0].message };
  const client = await createClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user?.email_confirmed_at)
    return { error: "Sign in again to continue.", denied: true };
  const budget = await client.rpc("space_budget", { p_operation: "request" });
  if (budget.error)
    return { error: "Community services unavailable. Check Phase 10 setup." };
  if (!budget.data) return { error: "Please wait before trying again." };
  const { operation, ...data } = p.data;
  const r = await client.rpc("space_command", {
    p_operation: operation,
    p_data: data,
  });
  return r.error
    ? {
        error:
          r.error.code === "42501"
            ? "This action is unavailable. Check your membership, permissions and the recipient’s contact preferences."
            : r.error.code === "22023" || r.error.code === "23514"
              ? "Check the details, selected time zone and date range, then retry."
              : r.error.code === "55000"
                ? "This event has ended or was cancelled."
                : "Community services unavailable. Please retry.",
        denied: r.error.code === "42501",
      }
    : r.data?.limited
      ? { error: "Please wait before trying again." }
      : { data: r.data };
}
