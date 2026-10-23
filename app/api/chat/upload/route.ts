import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/src/lib/supabase/server";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { appOrigin } from "@/src/lib/config";
import { idSchema } from "@/src/lib/chat/validation";
import {
  prepareAttachment,
  MAX_FILE_BYTES,
  readUploadForm,
} from "@/src/lib/chat/files";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  const fail = (error: string, status = 400) =>
    NextResponse.json({ error }, { status, headers });
  if (request.headers.get("origin") !== appOrigin())
    return fail("Request unavailable.", 403);
  const length = Number(request.headers.get("content-length"));
  if (length > MAX_FILE_BYTES + 64 * 1024)
    return fail("Choose a file up to 3 MB.", 413);
  const client = await createClient();
  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser();
  if (authError || !user?.email_confirmed_at)
    return fail("Sign in required.", 401);
  let form: FormData;
  try {
    form = await readUploadForm(request);
  } catch {
    return fail("Choose a valid file up to 3 MB.");
  }
  const channel = form.get("channel");
  const file = form.get("file");
  if (!idSchema.safeParse(channel).success || !(file instanceof File))
    return fail("Choose a file and channel.");
  const access = await client.rpc("channel_access", {
    p_channel: channel,
    p_permission: "post",
  });
  if (access.error || access.data !== true)
    return fail("Channel unavailable.", 403);
  const budget = await client.rpc("chat_upload_budget", { p_channel: channel });
  if (budget.error || budget.data !== true)
    return fail("Please wait before uploading another file.", 429);
  let prepared;
  try {
    prepared = await prepareAttachment(file);
  } catch (e) {
    return fail(
      e instanceof Error ? e.message : "This file could not be processed.",
    );
  }
  const admin = createAdminClient();
  const id = randomUUID(),
    path = `${channel}/${user.id}/${id}`;
  const uploaded = await admin.storage
    .from("message-files")
    .upload(path, prepared.buffer, {
      contentType: prepared.mime,
      upsert: false,
      cacheControl: "0",
    });
  if (uploaded.error) return fail("Upload unavailable. Please retry.", 503);
  const registered = await client.rpc("register_message_attachment", {
    p_id: id,
    p_channel: channel,
    p_path: path,
    p_filename: prepared.filename,
    p_mime: prepared.mime,
    p_kind: prepared.kind,
    p_size: prepared.buffer.length,
  });
  if (registered.error || registered.data !== true) {
    await admin.storage.from("message-files").remove([path]);
    return fail(
      "Upload could not be saved. Check permissions or try again later.",
      403,
    );
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
}
