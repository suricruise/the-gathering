import { NextResponse } from "next/server";
import { createClient } from "@/src/lib/supabase/server";
import { readSchema } from "@/src/lib/spaces/validation";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
export async function GET(request: Request) {
  const q = Object.fromEntries(new URL(request.url).searchParams);
  const p = readSchema.safeParse(q);
  if (!p.success)
    return NextResponse.json(
      { error: "Invalid view." },
      { status: 400, headers },
    );
  const client = await createClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user?.email_confirmed_at)
    return NextResponse.json(
      { error: "Sign in required." },
      { status: 401, headers },
    );
  const v = p.data;
  const r = await client.rpc("space_read", {
    p_view: v.view,
    p_resource: v.resource,
    p_community: v.community,
    p_before: v.before,
    p_filter: v.filter,
  });
  return r.error
    ? NextResponse.json(
        {
          error:
            "This view is unavailable. Check membership and Phase 10 setup.",
        },
        { status: r.error.code === "42501" ? 403 : 503, headers },
      )
    : NextResponse.json({ data: r.data }, { headers });
}
