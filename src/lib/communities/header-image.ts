import "server-only";
import sharp from "sharp";
export async function prepareCommunityHeader(file: File) {
  if (!file.size || file.size > 3 * 1024 * 1024)
    throw Error("Choose an image up to 3 MB.");
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw Error("Choose a JPEG, PNG or WebP image.");
  try {
    const input = Buffer.from(await file.arrayBuffer());
    const image = sharp(input, { limitInputPixels: 20_000_000 });
    const meta = await image.metadata();
    if (!["jpeg", "png", "webp"].includes(meta.format ?? "") || (meta.pages ?? 1) !== 1)
      throw Error("Invalid image");
    return await image.rotate().resize(1920, 640, { fit: "cover", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
  } catch {
    throw Error("This image could not be read. Choose a static JPEG, PNG or WebP image under 20 megapixels.");
  }
}
