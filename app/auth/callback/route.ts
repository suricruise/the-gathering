import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/src/lib/supabase/server";
import { appOrigin, publicConfig } from "@/src/lib/config";
import { safeNext } from "@/src/lib/auth/validation";
import { authLinkHeaders, authLinkProblem, authLinkUnavailable } from "@/src/lib/auth/link-response";
export async function GET(request: NextRequest) {
  let origin: string;
  try { origin = appOrigin(); if (!publicConfig()) return authLinkProblem("configuration"); }
  catch { return authLinkProblem("configuration"); }
  const code = request.nextUrl.searchParams.get("code");
  if (!code || code.length > 2048) return authLinkProblem("invalid");
  try {
    const client = await createClient();
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (error) return authLinkProblem(
      ["flow_state_not_found", "bad_code_verifier", "pkce_verifier_not_found", "pkce_code_verifier_not_found", "flow_state_expired"].includes(error.code ?? "")
        ? "browser" : authLinkUnavailable(error) ? "unavailable" : "invalid",
    );
    return NextResponse.redirect(new URL(safeNext(request.nextUrl.searchParams.get("next"), "/onboarding"), origin), { headers: authLinkHeaders });
  } catch { return authLinkProblem("unavailable"); }
}
