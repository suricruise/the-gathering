import "server-only";
import { createHmac } from "node:crypto";
import { createAdminClient } from "../supabase/admin";

function dependencyFailure(code: string): never {
  // Never log emails, digests, provider messages, request headers, or keys.
  console.error("[auth] Signup limiter dependency unavailable", { code });
  throw new Error("Authentication limiter is unavailable");
}

export async function allowAuthAttempt(email: string) {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) return dependencyFailure("MISSING_SERVER_KEY");
  // Same response and shared budget for all auth operations on an address.
  const digest = createHmac("sha256", secret)
    .update(email.toLowerCase())
    .digest("hex");
  let result;
  try {
    result = await createAdminClient().rpc("consume_auth_rate_limit", {
      digest,
    });
  } catch {
    return dependencyFailure("RPC_REQUEST_FAILED");
  }
  if (result.error) {
    const code = result.error.code;
    return dependencyFailure(
      typeof code === "string" && /^[A-Z0-9_]{1,24}$/.test(code)
        ? code
        : "RPC_ERROR",
    );
  }
  if (result.data !== true && result.data !== false)
    return dependencyFailure("INVALID_LIMITER_RESPONSE");
  return result.data;
}
