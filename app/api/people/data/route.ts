import { NextResponse } from "next/server";
import { createClient } from "@/src/lib/supabase/server";
import { appOrigin } from "@/src/lib/config";
import { historySchema } from "@/src/lib/people/validation";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
function json(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers });
}
async function identity() {
  const client = await createClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  return error || !user?.email_confirmed_at ? null : client;
}
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const id = q.get("conversation");
  const history = id
    ? historySchema.safeParse({ conversation: id, before: q.get("before") })
    : null;
  if (history && !history.success)
    return json({ error: "Conversation unavailable.", denied: true }, 400);
  const client = await identity();
  if (!client)
    return json(
      { error: "Sign in again to load people and messages.", denied: true },
      401,
    );
  const r = history?.success
    ? await client.rpc("dm_history", {
        p_conversation: history.data.conversation,
        p_before: history.data.before,
      })
    : await client.rpc("people_home");
  return r.error
    ? json(
        {
          error: "People or messages are unavailable.",
          denied: r.error.code === "42501",
        },
        r.error.code === "42501" ? 403 : 503,
      )
    : json({ data: r.data });
}
export async function POST(request: Request) {
  if (request.headers.get("origin") !== appOrigin())
    return json(
      { error: "Open the production website before sharing presence." },
      403,
    );
  const client = await identity();
  if (!client) return json({ error: "Sign in required.", denied: true }, 401);
  const r = await client.rpc("people_command", {
    p_operation: "heartbeat",
    p_data: {},
  });
  // Separate opt-in presence; older deployments may not have this additive RPC yet.
  if (!r.error && !r.data?.limited) await client.rpc("community_presence_pulse");
  return r.error
    ? json({ error: "Presence unavailable." }, 503)
    : r.data?.limited
      ? json({ error: "Please wait before trying again." }, 429)
      : json({ data: r.data });
}
