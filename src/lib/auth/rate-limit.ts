import "server-only";
import { createHmac } from "node:crypto";
import { createAdminClient } from "../supabase/admin";
export async function allowAuthAttempt(email: string) {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) return false;
  // Same response and shared budget for all auth operations on an address.
  const digest = createHmac("sha256", secret)
    .update(email.toLowerCase())
    .digest("hex");
  const { data, error } = await createAdminClient().rpc(
    "consume_auth_rate_limit",
    { digest },
  );
  return !error && data === true;
}
