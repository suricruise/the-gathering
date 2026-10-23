import "server-only";
import sharp from "sharp";
import { HEADER_SOURCE_BYTES, HEADER_MAX_PIXELS, HEADER_UPLOAD_BYTES } from "./header-limits";
export async function prepareCommunityHeader(file: File) {
  if (!file.size || file.size > HEADER_SOURCE_BYTES)
    throw Error("Choose an image up to 5 MB.");
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw Error("Choose a JPEG, PNG or WebP image.");
  try {
    const input = Buffer.from(await file.arrayBuffer());
    const image = sharp(input, { limitInputPixels: HEADER_MAX_PIXELS });
    const meta = await image.metadata();
    if (!["jpeg", "png", "webp"].includes(meta.format ?? "") || (meta.pages ?? 1) !== 1)
      throw Error("Invalid image");
    const output = await image.rotate().resize(1920, 640, { fit: "cover", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
    if (output.length > HEADER_UPLOAD_BYTES) throw Error("Output image too large");
    return output;
  } catch {
    throw Error("This image could not be read. Choose a static JPEG, PNG or WebP image under 20 megapixels.");
  }
}
