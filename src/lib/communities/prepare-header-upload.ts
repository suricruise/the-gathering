import { HEADER_MAX_PIXELS, HEADER_SOURCE_BYTES, HEADER_UPLOAD_BYTES } from "./header-limits";
export async function prepareHeaderUpload(file: File): Promise<File> {
  if (!file.size || file.size > HEADER_SOURCE_BYTES)
    throw Error("Choose an image up to 5 MB.");
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw Error("Choose a JPEG, PNG or WebP image.");
  if (file.size <= HEADER_UPLOAD_BYTES) return file;
  // Vercel cannot receive a 5 MB multipart body. Resize large source images locally;
  // the server still independently decodes, validates and sanitizes the result.
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(file);
    if (bitmap.width * bitmap.height > HEADER_MAX_PIXELS)
      throw Error("Image exceeds pixel limit");
    const canvas = document.createElement("canvas");
    canvas.width = Math.min(1920, bitmap.width);
    canvas.height = Math.min(640, bitmap.height);
    const context = canvas.getContext("2d");
    if (!context) throw Error("Image preparation unavailable");
    const scale = Math.max(canvas.width / bitmap.width, canvas.height / bitmap.height);
    const width = bitmap.width * scale, height = bitmap.height * scale;
    context.fillStyle = "#101322";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, (canvas.width-width)/2, (canvas.height-height)/2, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob || blob.size > HEADER_UPLOAD_BYTES) throw Error("Image preparation unavailable");
    return new File([blob], "community-header.jpg", { type: "image/jpeg" });
  } catch {
    throw Error("This image could not be prepared. Choose a static JPEG, PNG or WebP under 20 megapixels, or resize it and retry.");
  } finally { bitmap?.close(); }
}
