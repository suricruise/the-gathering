import "server-only";
import sharp from "sharp";
import { hasUnsafeControls } from "./validation";
export const MAX_FILE_BYTES = 3 * 1024 * 1024;
export function safeFilename(name: string) {
  return (
    name
      .replace(/[^\p{L}\p{N} ._()-]/gu, "_")
      .slice(0, 120)
      .trim() || "attachment"
  );
}
function downloadName(name: string, extension: string) {
  return (
    (name.replace(/\.[^.]*$/, "") || "attachment").slice(
      0,
      120 - extension.length,
    ) + extension
  );
}
export async function prepareAttachment(file: File) {
  if (!file.size || file.size > MAX_FILE_BYTES)
    throw Error("Choose a file up to 3 MB.");
  const buffer = Buffer.from(await file.arrayBuffer());
  const filename = safeFilename(file.name);
  if (
    ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)
  ) {
    const metadata = await sharp(buffer, {
      animated: true,
      limitInputPixels: 40_000_000,
    }).metadata();
    if (
      !["jpeg", "png", "webp", "gif"].includes(metadata.format ?? "") ||
      !metadata.width ||
      !metadata.height ||
      metadata.width > 4096 ||
      (metadata.pageHeight ?? metadata.height) > 4096 ||
      (metadata.pages ?? 1) > 100 ||
      metadata.width * metadata.height > 40_000_000
    )
      throw Error(
        "Choose an image up to 4096 × 4096, with at most 100 frames.",
      );
    const output = await sharp(buffer, {
      animated: true,
      limitInputPixels: 40_000_000,
    })
      .rotate()
      .resize({
        width: 1600,
        height: 1600,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 82, effort: 3 })
      .toBuffer();
    if (output.length > MAX_FILE_BYTES)
      throw Error("This image is too large after processing.");
    return {
      buffer: output,
      filename: downloadName(filename, ".webp"),
      mime: "image/webp",
      kind: (metadata.pages ?? 1) > 1 ? "gif" : "photo",
    };
  }
  if (
    file.type === "application/pdf" &&
    buffer.subarray(0, 5).toString() === "%PDF-" &&
    buffer.subarray(-2048).includes(Buffer.from("%%EOF"))
  )
    return {
      buffer,
      filename: downloadName(filename, ".pdf"),
      mime: "application/pdf",
      kind: "file",
    };
  if (
    ["text/plain", "text/csv", "text/markdown"].includes(file.type) &&
    buffer.length <= 512 * 1024
  ) {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    if (
      hasUnsafeControls(text) ||
      /^\s*<(?:!doctype|html|script|svg)/i.test(text)
    )
      throw Error("Choose a plain UTF-8 text file.");
    return {
      buffer,
      filename: downloadName(
        filename,
        file.type === "text/csv" ? ".csv" : ".txt",
      ),
      mime: file.type === "text/csv" ? "text/csv" : "text/plain",
      kind: "file",
    };
  }
  throw Error(
    "Supported files: JPEG, PNG, WebP, GIF, PDF, plain text, Markdown, and CSV.",
  );
}

export async function readUploadForm(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw Error("Choose a file.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_FILE_BYTES + 64 * 1024) {
        await reader.cancel();
        throw Error("Choose a file up to 3 MB.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const data = Buffer.concat(chunks);
  return new Response(data, {
    headers: { "Content-Type": request.headers.get("content-type") ?? "" },
  }).formData();
}
