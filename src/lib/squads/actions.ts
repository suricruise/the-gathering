"use server";
import { z } from "zod";
import { requireUser } from "../auth/session";
import { commandSchema, filtersSchema } from "./validation";
import type { Result, Page, Squad, Block } from "./types";
function failure(code?: string) {
  return {
    error:
      code === "54000"
        ? "This group is full, its approval queue is full, or your active-session limit has been reached. Refresh and choose another session."
        : code === "55000"
          ? "This session has ended. Refresh to see current sessions."
          : code === "42501"
            ? "This session or action is unavailable. Your access may have changed."
            : code === "22023"
              ? "Check your platform, start time and session details, then retry."
              : "Squad Up is unavailable. Please retry; an administrator may need to apply the Phase 8 migrations.",
  };
}
export async function squadCommand(
  input: unknown,
): Promise<Result<{ id?: string; status?: string; ok?: boolean }>> {
  const parsed = commandSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { client } = await requireUser("/squad-up");
  const { operation, ...data } = parsed.data;
  const category = ["create", "join", "withdraw"].includes(operation)
    ? operation
    : ["block-host", "block-member", "unblock"].includes(operation)
      ? "block"
      : "host";
  try {
    const budget = await client.rpc("squad_budget", { p_operation: category });
    if (budget.error) return failure();
    if (budget.data !== true)
      return { error: "Please wait before trying again." };
    const r = await client.rpc("squad_command", {
      p_operation: operation,
      p_data: data,
    });
    if (r.error) return failure(r.error.code);
    if (r.data?.limited) return { error: "Please wait before trying again." };
    return { data: r.data };
  } catch {
    return failure();
  }
}
export async function getSquads(input: unknown): Promise<Result<Page>> {
  const p = filtersSchema.safeParse(input);
  if (!p.success) return { error: "Choose valid session filters." };
  const { client } = await requireUser("/squad-up");
  const v = p.data;
  const r = await client.rpc("squad_list", {
    p_mode: v.mode,
    p_game: v.game,
    p_platform: v.platform,
    p_slots: v.slots,
    p_when: v.when,
    p_style: v.style,
    p_community: v.community,
    p_before: v.before,
  });
  return r.error ? failure(r.error.code) : { data: r.data };
}
export async function getSquad(id: string): Promise<Result<Squad>> {
  if (!z.uuid().safeParse(id).success) return { error: "Session unavailable." };
  const { client } = await requireUser("/squad-up");
  const r = await client.rpc("squad_detail", { p_session: id });
  return r.error || !r.data
    ? {
        error:
          "Session unavailable. It may have ended or your access may have changed.",
      }
    : { data: r.data };
}
export async function getSquadBlocks(): Promise<Result<Block[]>> {
  const { client, user } = await requireUser("/squad-up");
  const r = await client
    .from("member_blocks")
    .select("blocked_id,label,created_at")
    .eq("blocker_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  return r.error ? failure(r.error.code) : { data: r.data };
}
