import { createClient } from "@/src/lib/supabase/server";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { z } from "zod";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const missing = () =>
    new Response("Not found", {
      status: 404,
      headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
    });
  if (!z.uuid().safeParse(id).success) return missing();
  const c = await createClient();
  const {
    data: { user },
    error,
  } = await c.auth.getUser();
  if (error || !user?.email_confirmed_at) return missing();
  const r = await c.rpc("admin_evidence_file", { p_id: id });
  if (r.error || !r.data) return missing();
  // The database supplies both bucket and path after a live scoped authorization check.
  const f = r.data;
  if (
    !["message-files", "social-media"].includes(f.bucket) ||
    typeof f.storage_path !== "string"
  )
    return missing();
  const { data: file, error: failure } = await createAdminClient()
    .storage.from(f.bucket)
    .download(f.storage_path);
  if (failure || !file) return missing();
  const image = f.mime === "image/webp";
  return new Response(file, {
    headers: {
      "Content-Type": image ? "image/webp" : "application/octet-stream",
      "Content-Disposition": `${image ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(f.filename)}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, no-store",
      Vary: "Cookie",
    },
  });
}
