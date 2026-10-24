import type { NextRequest } from "next/server";
import { updateSession } from "./src/lib/supabase/proxy";
export async function proxy(request: NextRequest) {
  return updateSession(request);
}
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.svg|sw\\.js$|manifest\\.webmanifest$|offline\\.html$|pwa/|install(?:/|$)|api/health|api/ops/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff|woff2)$).*)",
  ],
};
