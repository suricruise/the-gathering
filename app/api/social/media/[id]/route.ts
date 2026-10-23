import { z } from "zod";
import { createClient } from "@/src/lib/supabase/server";
import { createAdminClient } from "@/src/lib/supabase/admin";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const headers = {
    "Cache-Control": "private, no-store",
    Vary: "Cookie",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
  };
  const missing = () => new Response("Not found", { status: 404, headers });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return missing();
  const client = await createClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user?.email_confirmed_at) return missing();
  const { data: media, error: denied } = await client
    .from("post_media")
    .select("id,filename,mime,byte_size")
    .eq("id", id)
    .maybeSingle();
  if (denied || !media) return missing();
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("post_media")
    .select("storage_path")
    .eq("id", id)
    .single();
  if (!row) return missing();
  const { data: file, error: unavailable } = await admin.storage
    .from("social-media")
    .download(row.storage_path);
  if (unavailable || !file) return missing();
  const bytes = Buffer.from(await file.arrayBuffer());
  const extra = {
    ...headers,
    "Content-Type": media.mime,
    "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(media.filename)}`,
    "Accept-Ranges": "bytes",
  };
  const range = request.headers.get("range");
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!m || (!m[1] && !m[2]))
      return new Response(null, {
        status: 416,
        headers: { ...headers, "Content-Range": `bytes */${bytes.length}` },
      });
    const start = m[1]
      ? Number(m[1])
      : Math.max(0, bytes.length - Number(m[2]));
    const end =
      m[1] && m[2]
        ? Math.min(Number(m[2]), bytes.length - 1)
        : bytes.length - 1;
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start > end ||
      start >= bytes.length
    )
      return new Response(null, {
        status: 416,
        headers: { ...headers, "Content-Range": `bytes */${bytes.length}` },
      });
    return new Response(bytes.subarray(start, end + 1), {
      status: 206,
      headers: {
        ...extra,
        "Content-Length": String(end - start + 1),
        "Content-Range": `bytes ${start}-${end}/${bytes.length}`,
      },
    });
  }
  return new Response(bytes, {
    headers: { ...extra, "Content-Length": String(bytes.length) },
  });
}
