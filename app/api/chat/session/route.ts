import { NextResponse } from "next/server";
import { createClient } from "@/src/lib/supabase/server";
import { idSchema } from "@/src/lib/chat/validation";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const channel = new URL(request.url).searchParams.get("channel");
  if (!idSchema.safeParse(channel).success)
    return NextResponse.json({ error: "Invalid channel" }, { status: 400 });
  const client = await createClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user?.email_confirmed_at)
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const result = await client.rpc("chat_session", { p_channel: channel });
  if (result.error)
    return NextResponse.json(
      { error: "Channel unavailable" },
      { status: result.error.code === "42501" ? 403 : 503 },
    );
  const {
    data: { session },
  } = await client.auth.getSession();
  if (!session)
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  // Only the short-lived access token enters JS memory. No refresh token or service key.
  return NextResponse.json(
    {
      ...result.data,
      access_token: session.access_token,
      expires_at: session.expires_at,
    },
    { headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } },
  );
}
