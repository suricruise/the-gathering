import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicConfig } from "../config";
export function createAdminClient() {
  const config = publicConfig();
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!config || !key) throw new Error("Server credentials are not configured");
  return createClient(config.url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
