import "server-only";
export type AuthLinkProblem = "invalid" | "browser" | "unavailable" | "configuration";
export const authLinkHeaders = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex",
};
export function authLinkProblem(problem: AuthLinkProblem) {
  // A fixed relative destination still works when APP_URL itself is broken.
  // Never forward tokens, provider errors or a caller-controlled redirect URL.
  return new Response(null, {
    status: 303,
    headers: { ...authLinkHeaders, Location: `/verify-email?reason=${problem}` },
  });
}

export function authLinkUnavailable(error: { status?: number; name?: string }) {
  return (error.status ?? 0) >= 500 || error.name === "AuthRetryableFetchError";
}
