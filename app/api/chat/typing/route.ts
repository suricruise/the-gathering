import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/src/lib/supabase/server";
import { appOrigin } from "@/src/lib/config";
const schema = z.object({ channel: z.uuid(), active: z.boolean() }).strict();
export async function POST(request: Request) {
  const reply = (status: number) =>
    NextResponse.json(
      { ok: status === 200 },
      { status, headers: { "Cache-Control": "private, no-store" } },
    );
  if (
    request.headers.get("origin") !== appOrigin() ||
    Number(request.headers.get("content-length")) > 512
  )
    return reply(403);
  let input;
  try {
    input = schema.safeParse(await request.json());
  } catch {
    return reply(400);
  }
  if (!input.success) return reply(400);
  const client = await createClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user?.email_confirmed_at) return reply(401);
  const result = await client.rpc("chat_typing", {
    p_channel: input.data.channel,
    p_active: input.data.active,
  });
  return reply(result.error ? 403 : result.data === true ? 200 : 429);
}
