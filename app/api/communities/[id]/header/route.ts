import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/src/lib/supabase/server";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { appOrigin } from "@/src/lib/config";
import { readUploadForm } from "@/src/lib/chat/files";
import { prepareCommunityHeader } from "@/src/lib/communities/header-image";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const fail = (error: string, status = 400) => Response.json({ error }, { status, headers });
export async function GET(_request: Request, context: Context) {
  try {
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) return new Response(null, { status: 404, headers });
    const client = await createClient();
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user?.email_confirmed_at) return new Response(null, { status: 404, headers });
    const result = await client.from("community_headers").select("object_path").eq("community_id", id).maybeSingle();
    if (result.error || !result.data) return new Response(null, { status: 404, headers });
    const download = await createAdminClient().storage.from("community-headers").download(result.data.object_path);
    if (download.error || !download.data) return new Response(null, { status: 404, headers });
    return new Response(download.data, { headers: { ...headers, "Content-Type": "image/webp", "Content-Security-Policy": "default-src 'none'" } });
  } catch { return new Response(null, { status: 404, headers }); }
}
async function change(request: Request, context: Context, remove: boolean) {
  try {
    if (request.headers.get("origin") !== appOrigin()) return fail("Open the production website before changing the header.", 403);
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) return fail("Community unavailable.", 404);
    const client = await createClient();
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user?.email_confirmed_at) return fail("Sign in required.", 401);
    const access = await client.rpc("community_header_command", { p_community: id, p_operation: "check" });
    if (access.error || access.data !== "allowed") return fail("Header changes require an active community owner or administrator. You may also need to wait before retrying.", 403);
    const admin = createAdminClient();
    let path: string | undefined;
    let version: string | undefined;
    let size: number | undefined;
    if (!remove) {
      const form = await readUploadForm(request);
      const file = form.get("file");
      if (!(file instanceof File)) return fail("Choose an image.");
      let buffer: Buffer;
      try { buffer = await prepareCommunityHeader(file); }
      catch (e) { return fail(e instanceof Error ? e.message : "Invalid image."); }
      version = randomUUID(); size = buffer.length;
      path = `${user.id}/${id}/${version}.webp`;
      const upload = await admin.storage.from("community-headers").upload(path, buffer, { contentType: "image/webp", cacheControl: "0", upsert: false });
      if (upload.error) return fail("Image upload unavailable. Please retry.", 503);
    }
    const saved = await client.rpc("community_header_command", {
      p_community: id, p_operation: remove ? "remove" : "save",
      ...(path ? { p_path: path, p_version: version, p_size: size } : {}),
    });
    if (saved.error) {
      if (path) await admin.storage.from("community-headers").remove([path]);
      return fail("Header could not be saved. Your permissions may have changed.", 403);
    }
    if (typeof saved.data === "string" && saved.data !== path)
      await admin.storage.from("community-headers").remove([saved.data]);
    revalidatePath("/communities", "layout");
    return Response.json({ notice: remove ? "Custom header removed." : "Community header updated." }, { headers });
  } catch { return fail("Header services are unavailable. Please retry.", 503); }
}
export async function POST(request: Request, context: Context) { return change(request, context, false); }
export async function DELETE(request: Request, context: Context) { return change(request, context, true); }
