import { NextResponse } from "next/server";
import { createClient } from "@/src/lib/supabase/server";
import { appOrigin } from "@/src/lib/config";
import {
  tokenInput,
  sessionInput,
  controlInput,
  type VoiceAdmission,
} from "@/src/lib/voice/validation";
import {
  voiceConfig,
  roomService,
  issueVoiceToken,
  removeVoiceParticipant,
  isMissingRoom,
} from "@/src/lib/voice/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ operation: string }> },
) {
  const reply = (status: number, data: object) =>
    NextResponse.json(data, {
      status,
      headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
    });
  try {
    if (request.headers.get("origin") !== appOrigin())
      return reply(403, { error: "Voice request rejected." });
    // Bound the actual body, including chunked requests, before JSON parsing.
    const reader = request.body?.getReader();
    let text = "";
    let size = 0;
    if (reader) {
      const decoder = new TextDecoder();
      try {
        while (true) {
          const r = await reader.read();
          if (r.done) break;
          size += r.value.byteLength;
          if (size > 1024) {
            await reader.cancel();
            return reply(400, { error: "Invalid voice request." });
          }
          text += decoder.decode(r.value, { stream: true });
        }
        text += decoder.decode();
      } finally {
        reader.releaseLock();
      }
    }
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return reply(400, { error: "Invalid voice request." });
    }
    const { operation } = await params;
    const input = (
      operation === "token"
        ? tokenInput
        : operation === "control"
          ? controlInput
          : sessionInput
    ).safeParse(body);
    if (
      !["token", "control", "session", "leave"].includes(operation) ||
      !input.success
    )
      return reply(400, { error: "Invalid voice request." });
    const client = await createClient();
    const {
      data: { user },
      error,
    } = await client.auth.getUser();
    if (error || !user?.email_confirmed_at)
      return reply(401, { error: "Sign in to use voice." });
    const budget = await client.rpc("voice_request_budget", {
      p_operation: operation,
    });
    if (budget.error)
      return reply(503, { error: "Voice admission services are unavailable." });
    if (budget.data !== true)
      return reply(429, { error: "Please wait before trying voice again." });
    voiceConfig();
    if (operation === "token") {
      const parsed = tokenInput.parse(body);
      const { data, error: denied } = await client.rpc("voice_admit", {
        p_channel: parsed.channel,
      });
      if (denied)
        return reply(
          denied.code === "55000" ? 503 : denied.code === "54000" ? 409 : 403,
          {
            error:
              denied.code === "54000"
                ? "This room is full."
                : denied.code === "55000"
                  ? "Voice enforcement is unavailable, or another voice session is still active. Leave it before joining again."
                  : "Voice access is unavailable.",
          },
        );
      if (data?.limited)
        return reply(429, { error: "Please wait before joining again." });
      const admission = data as VoiceAdmission;
      try {
        await roomService().createRoom({
          name: admission.room,
          maxParticipants: admission.limit,
          emptyTimeout: 120,
          departureTimeout: 30,
        });
        // Recheck after the external call; the worker enforces later revocations.
        const check = await client.rpc("voice_session", {
          p_ticket: admission.ticket,
        });
        if (check.error || check.data?.allowed !== true)
          throw Error("Access changed");
        return reply(200, await issueVoiceToken(user.id, admission));
      } catch {
        await client.rpc("voice_session", {
          p_ticket: admission.ticket,
          p_leave: true,
        });
        return reply(503, {
          error: "Voice could not connect. Please try again shortly.",
        });
      }
    }
    if (operation === "control") {
      const parsed = controlInput.parse(body);
      const { data, error: denied } = await client.rpc("voice_command", {
        p_channel: parsed.channel,
        p_operation: parsed.operation,
        ...(parsed.operation === "remove"
          ? { p_target: parsed.target }
          : { p_limit: parsed.limit, p_locked: parsed.locked }),
      });
      if (denied)
        return reply(403, { error: "This voice action is not authorized." });
      if (data?.limited)
        return reply(429, { error: "Please wait before trying again." });
      try {
        if (parsed.operation === "remove")
          await removeVoiceParticipant(data.room, parsed.target);
        else await roomService().deleteRoom(data.room);
      } catch (e) {
        if (!isMissingRoom(e))
          return reply(503, {
            error:
              "The restriction is saved; voice disconnection is pending enforcement.",
          });
      }
      return reply(200, { ok: true });
    }
    const parsed = sessionInput.parse(body);
    const { data, error: denied } = await client.rpc("voice_session", {
      p_ticket: parsed.ticket,
      p_leave: operation === "leave",
    });
    if (denied) return reply(403, { error: "Voice access has ended." });
    if (operation === "leave" || !data.allowed)
      await removeVoiceParticipant(data.room, user.id);
    return reply(200, { allowed: data.allowed });
  } catch {
    return reply(503, {
      error: "Voice services are unavailable. Contact the site administrator.",
    });
  }
}
