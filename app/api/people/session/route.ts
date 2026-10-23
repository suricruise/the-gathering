import { NextResponse } from "next/server";
import { createClient } from "@/src/lib/supabase/server";
import { z } from "zod";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("conversation");
  if (query && !z.uuid().safeParse(query).success)
    return NextResponse.json(
      { error: "Invalid conversation" },
      { status: 400 },
    );
  const client = await createClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user?.email_confirmed_at)
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const topic = query ? `dm:${query}` : `people:${user.id}`;
  const r = await client.rpc("people_topic_allowed", { p_topic: topic });
  if (r.error || r.data !== true)
    return NextResponse.json(
      { error: "Conversation unavailable" },
      { status: r.error ? 503 : 403 },
    );
  const {
    data: { session },
  } = await client.auth.getSession();
  if (!session)
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  return NextResponse.json(
    { topic, access_token: session.access_token },
    { headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } },
  );
}
