import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "../supabase/server";
import { publicConfig } from "../config";
import { safeNext } from "./validation";
export async function requireUser(next = "/home") {
  if (!publicConfig()) redirect("/login?setup=required");
  const client = await createClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user || !user.email_confirmed_at)
    redirect(`/login?next=${encodeURIComponent(safeNext(next))}`);
  return { client, user };
}
