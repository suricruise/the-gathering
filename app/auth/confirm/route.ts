import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/src/lib/supabase/server";
import { appOrigin, publicConfig } from "@/src/lib/config";
import { authLinkHeaders, authLinkProblem, authLinkUnavailable } from "@/src/lib/auth/link-response";
export async function GET(request: NextRequest) {
  let origin: string;
  try { origin = appOrigin(); if (!publicConfig()) return authLinkProblem("configuration"); }
  catch { return authLinkProblem("configuration"); }
  const token_hash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  if (!token_hash || token_hash.length > 512 || (type !== "email" && type !== "recovery"))
    return authLinkProblem("invalid");
  try {
    const client = await createClient();
    const { error } = await client.auth.verifyOtp({ token_hash, type });
    if (error) return authLinkProblem(authLinkUnavailable(error) ? "unavailable" : "invalid");
    return NextResponse.redirect(new URL(type === "recovery" ? "/reset-password" : "/onboarding", origin), { headers: authLinkHeaders });
  } catch { return authLinkProblem("unavailable"); }
}
