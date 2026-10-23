import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/src/lib/supabase/server";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { appOrigin } from "@/src/lib/config";
import { readUploadForm } from "@/src/lib/chat/files";
import { prepareSocialMedia } from "@/src/lib/social/media";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  const fail = (error: string, status = 400) =>
    NextResponse.json({ error }, { status, headers });
  try {
    if (request.headers.get("origin") !== appOrigin())
      return fail("Open the production website before uploading.", 403);
    const client = await createClient();
    const {
      data: { user },
      error,
    } = await client.auth.getUser();
    if (error || !user?.email_confirmed_at)
      return fail("Sign in required.", 401);
    const budget = await client.rpc("social_budget", { p_operation: "upload" });
    if (budget.error || budget.data !== true)
      return fail(
        "Uploads unavailable or rate limited. Please retry shortly.",
        429,
      );
    const form = await readUploadForm(request);
    const file = form.get("file");
    if (!(file instanceof File)) return fail("Choose a file.");
    let prepared;
    try {
      prepared = await prepareSocialMedia(file, form.get("rights") === "yes");
    } catch (e) {
      return fail(
        e instanceof Error ? e.message : "This file could not be validated.",
      );
    }
    const id = randomUUID(),
      path = `${user.id}/${id}`,
      admin = createAdminClient();
    const upload = await admin.storage
      .from("social-media")
      .upload(path, prepared.buffer, {
        contentType: prepared.mime,
        upsert: false,
        cacheControl: "0",
      });
    if (upload.error) return fail("Upload unavailable. Please retry.", 503);
    const register = await client.rpc("register_post_media", {
      p_id: id,
      p_path: path,
      p_filename: prepared.filename,
      p_mime: prepared.mime,
      p_kind: prepared.kind,
      p_size: prepared.buffer.length,
      p_rights: prepared.rights,
    });
    if (register.error || register.data !== true) {
      await admin.storage.from("social-media").remove([path]);
      return fail("Upload could not be saved.", 403);
    }
    return NextResponse.json(
      {
        id,
        filename: prepared.filename,
        mime: prepared.mime,
        kind: prepared.kind,
        byte_size: prepared.buffer.length,
      },
      { headers },
    );
  } catch {
    return fail("Upload failed. Choose a supported file up to 3 MB and retry.");
  }
}
