import "server-only";
import { Worker } from "node:worker_threads";
import { resolve } from "node:path";
import { prepareAttachment, MAX_FILE_BYTES, safeFilename } from "../chat/files";
export async function prepareSocialMedia(file: File, rights: boolean) {
  if (!file.size || file.size > MAX_FILE_BYTES)
    throw Error("Choose a photo or MP4 up to 3 MB.");
  if (file.type.startsWith("image/")) {
    const prepared = await prepareAttachment(file);
    if (!["photo", "gif"].includes(prepared.kind))
      throw Error("Choose a photo or MP4.");
    return { ...prepared, rights: false };
  }
  if (file.type !== "video/mp4" || !rights)
    throw Error("Choose an MP4 and confirm you have permission to share it.");
  const buffer = Buffer.from(await file.arrayBuffer());
  const valid = await new Promise<boolean>((done) => {
    let settled = false;
    const worker = new Worker(
      resolve(process.cwd(), "scripts/inspect-social-video.mjs"),
      {
        // A plain object preserves the typed bytes through Next.js worker packaging.
        workerData: { bytes: buffer },
        resourceLimits: { maxOldGenerationSizeMb: 96, stackSizeMb: 2 },
        stdout: true,
        stderr: true,
      },
    );
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      done(ok);
    };
    const timer = setTimeout(() => finish(false), 3000);
    worker.once("message", (m) => finish(m?.ok === true));
    worker.once("error", () => finish(false));
    worker.once("exit", () => finish(false));
    worker.stdout?.resume();
    worker.stderr?.resume();
  });
  if (!valid)
    throw Error(
      "Use a complete H.264 MP4 clip up to 90 seconds and 1920 × 1080, with optional stereo AAC audio.",
    );
  return {
    buffer,
    filename:
      safeFilename(file.name.replace(/\.[^.]*$/, "")).slice(0, 116) + ".mp4",
    mime: "video/mp4",
    kind: "video",
    rights: true,
  };
}
