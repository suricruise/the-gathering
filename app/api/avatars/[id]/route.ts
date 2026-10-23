import { createClient } from "@/src/lib/supabase/server";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { z } from "zod";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'",
    "Content-Type": "image/webp",
  };
  if (!z.uuid().safeParse(id).success)
    return new Response(null, { status: 404, headers });
  try {
    const client = await createClient();
    const { data: path, error } = await client.rpc("visible_avatar", {
      p_id: id,
    });
    if (error || !path) return new Response(null, { status: 404, headers });
    const { data, error: downloadError } = await createAdminClient()
      .storage.from("avatars")
      .download(path);
    if (downloadError || !data)
      return new Response(null, { status: 404, headers });
    return new Response(data, { headers });
  } catch {
    return new Response(null, { status: 404, headers });
  }
}
