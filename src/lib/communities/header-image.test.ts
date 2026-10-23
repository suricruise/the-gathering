// @vitest-environment node
import { expect, it, vi } from "vitest";
import sharp from "sharp";
vi.mock("server-only", () => ({}));
import { prepareCommunityHeader } from "./header-image";
it("converts a real image to bounded WebP and strips metadata", async () => {
  const source = await sharp({ create: { width: 2400, height: 1000, channels: 3, background: "navy" } }).jpeg().toBuffer();
  const output = await prepareCommunityHeader(new File([new Uint8Array(source)], "header.jpg", { type: "image/jpeg" }));
  const meta = await sharp(output).metadata();
  expect(meta.format).toBe("webp"); expect(meta.width).toBe(1920); expect(meta.height).toBe(640); expect(meta.exif).toBeUndefined();
});
it("rejects unsafe types, mismatched bytes, oversized and empty files", async () => {
  await expect(prepareCommunityHeader(new File(["<svg/>"], "x.svg", { type: "image/svg+xml" }))).rejects.toThrow("JPEG");
  await expect(prepareCommunityHeader(new File(["<script/>"], "x.png", { type: "image/png" }))).rejects.toThrow("could not be read");
  await expect(prepareCommunityHeader(new File([new Uint8Array(5*1024*1024+1)], "x.png", { type: "image/png" }))).rejects.toThrow("5 MB");
  await expect(prepareCommunityHeader(new File([], "x.png", { type: "image/png" }))).rejects.toThrow("5 MB");
});

it("accepts a valid source image at the 5 MiB boundary and stores a small sanitized header", async () => {
 const png = await sharp({ create: { width: 500, height: 300, channels: 3, background: "navy" } }).png().toBuffer();
 const padded = Buffer.concat([png, Buffer.alloc(5*1024*1024-png.length)]);
 const output = await prepareCommunityHeader(new File([new Uint8Array(padded)], "large.png", { type: "image/png" }));
 expect(output.length).toBeLessThan(3*1024*1024);
 expect((await sharp(output).metadata()).format).toBe("webp");
});
