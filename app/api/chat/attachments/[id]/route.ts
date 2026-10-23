import { createClient } from "@/src/lib/supabase/server";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { idSchema } from "@/src/lib/chat/validation";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const missing = () =>
    new Response("Not found", {
      status: 404,
      headers: { "Cache-Control": "private, no-store" },
    });
  if (!idSchema.safeParse(id).success) return missing();
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user?.email_confirmed_at) return missing();
  const { data: attachment, error } = await client
    .from("message_attachments")
    .select("id,filename,mime,kind")
    .eq("id", id)
    .maybeSingle();
  if (error || !attachment) return missing();
  const admin = createAdminClient();
  const { data: record } = await admin
    .from("message_attachments")
    .select("storage_path")
    .eq("id", id)
    .single();
  if (!record) return missing();
  const { data: file, error: downloadError } = await admin.storage
    .from("message-files")
    .download(record.storage_path);
  if (downloadError || !file) return missing();
  const image = attachment.mime === "image/webp";
  return new Response(file, {
    headers: {
      "Content-Type": image ? "image/webp" : "application/octet-stream",
      "Content-Disposition": `${image ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, no-store",
      Vary: "Cookie",
    },
  });
}
