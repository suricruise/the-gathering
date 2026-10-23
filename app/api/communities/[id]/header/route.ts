import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/src/lib/supabase/server";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { appOrigin } from "@/src/lib/config";
import { readUploadForm } from "@/src/lib/chat/files";
import { HEADER_SOURCE_BYTES } from "@/src/lib/communities/header-limits";
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
type HeaderStage = "configuration" | "authentication" | "authorization" | "storage-configuration" | "upload-body" | "storage-upload" | "save" | "refresh";
function logFailure(stage: HeaderStage, error?: { code?: string; statusCode?: string | number }) {
  // Never log provider messages, file names, request bodies, user IDs or credentials.
  const code = error?.code;
  const status = Number(error?.statusCode);
  console.error("[community-header]", {
    stage,
    ...(code && /^[A-Z0-9_]{1,24}$/i.test(code) ? { code } : {}),
    ...(Number.isInteger(status) && status >= 400 && status <= 599 ? { status } : {}),
  });
}
async function change(request: Request, context: Context, remove: boolean) {
  let stage: HeaderStage = "configuration";
  try {
    if (request.headers.get("origin") !== appOrigin()) return fail("Open the production website before changing the header.", 403);
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) return fail("Community unavailable.", 404);
    stage = "authentication";
    const client = await createClient();
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user?.email_confirmed_at) return fail("Sign in required.", 401);
    stage = "authorization";
    const access = await client.rpc("community_header_command", { p_community: id, p_operation: "check" });
    if (access.error && ["PGRST202", "42883"].includes(access.error.code)) {
      logFailure(stage, access.error);
      return fail("Header uploads need the community-header database update. Ask the site administrator to apply it.", 503);
    }
    if (access.error || access.data !== "allowed") return fail("Header changes require an active community owner or administrator. You may also need to wait before retrying.", 403);
    stage = "storage-configuration";
    const admin = createAdminClient();
    let path: string | undefined;
    let version: string | undefined;
    let size: number | undefined;
    if (!remove) {
      stage = "upload-body";
      let form: FormData;
      try { form = await readUploadForm(request, HEADER_SOURCE_BYTES); }
      catch (error) {
        if (error instanceof Error && error.message === "Choose a file up to 5 MB.")
          return fail("Choose an image up to 5 MB. Resize or compress this image and try again.", 413);
        return fail("The upload could not be read. Choose your image again and retry.");
      }
      const file = form.get("file");
      if (!(file instanceof File)) return fail("Choose an image.");
      let buffer: Buffer;
      try { buffer = await prepareCommunityHeader(file); }
      catch (e) { return fail(e instanceof Error ? e.message : "Invalid image."); }
      version = randomUUID(); size = buffer.length;
      path = `${user.id}/${id}/${version}.webp`;
      stage = "storage-upload";
      const upload = await admin.storage.from("community-headers").upload(path, buffer, { contentType: "image/webp", cacheControl: "0", upsert: false });
      if (upload.error) {
        logFailure(stage, upload.error);
        return fail("Image storage is unavailable. Ask the site administrator to check the private community-headers bucket and server Supabase credentials.", 503);
      }
    }
    stage = "save";
    const saved = await client.rpc("community_header_command", {
      p_community: id, p_operation: remove ? "remove" : "save",
      ...(path ? { p_path: path, p_version: version, p_size: size } : {}),
    });
    if (saved.error) {
      if (path) {
        try { await admin.storage.from("community-headers").remove([path]); }
        catch { /* Scheduled cleanup removes abandoned uploads. */ }
      }
      logFailure(stage, saved.error);
      return fail("Header could not be saved. Your permissions may have changed.", 403);
    }
    if (typeof saved.data === "string" && saved.data !== path) {
      try { await admin.storage.from("community-headers").remove([saved.data]); }
      catch { /* Do not report a committed header change as failed over orphan cleanup. */ }
    }
    stage = "refresh";
    try { revalidatePath("/communities", "layout"); }
    catch { logFailure(stage); }
    return Response.json({ notice: remove ? "Custom header removed." : "Community header updated." }, { headers });
  } catch {
    logFailure(stage);
    if (stage === "configuration")
      return fail("Header uploads are not configured. Ask the site administrator to verify APP_URL in Vercel and redeploy.", 503);
    if (stage === "storage-configuration")
      return fail("Header storage is not configured. Ask the site administrator to verify SUPABASE_SECRET_KEY in Vercel and redeploy.", 503);
    return fail(`Header services are unavailable (${stage}). Please retry or share this stage with the site administrator.`, 503);
  }
}
export async function POST(request: Request, context: Context) { return change(request, context, false); }
export async function DELETE(request: Request, context: Context) { return change(request, context, true); }
