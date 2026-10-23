// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { commandSchema, filtersSchema, clipLink } from "./validation";
import { prepareSocialMedia } from "./media";
const id = "a4000000-0000-4000-8000-000000000001";
const post = {
  operation: "create",
  id,
  body: "A real post",
  audience: "members",
  community: null,
  games: ["minecraft"],
  interests: ["co-op"],
  media: [],
};
describe("social validation", () => {
  it("rejects caller roles and identity fields", () => {
    for (const field of [
      { author_id: id },
      { role: "owner" },
      { status: "published" },
    ])
      expect(commandSchema.safeParse({ ...post, ...field }).success).toBe(
        false,
      );
    expect(commandSchema.safeParse(post).success).toBe(true);
  });
  it("requires a matching community audience and real content", () => {
    expect(commandSchema.safeParse({ ...post, community: id }).success).toBe(
      false,
    );
    expect(
      commandSchema.safeParse({
        ...post,
        audience: "community",
        community: null,
      }).success,
    ).toBe(false);
    expect(commandSchema.safeParse({ ...post, body: " " }).success).toBe(false);
    expect(
      commandSchema.safeParse({ ...post, body: "", media: [id] }).success,
    ).toBe(true);
  });
  it("bounds text, tags, cursors and moderation decisions", () => {
    expect(
      commandSchema.safeParse({ ...post, body: "x".repeat(5001) }).success,
    ).toBe(false);
    expect(
      commandSchema.safeParse({ ...post, body: "bad\u0001" }).success,
    ).toBe(false);
    expect(
      commandSchema.safeParse({ ...post, interests: ["invented"] }).success,
    ).toBe(false);
    expect(
      filtersSchema.safeParse({ before: "9223372036854775808" }).success,
    ).toBe(false);
    expect(
      commandSchema.safeParse({
        operation: "moderate",
        report: id,
        decision: "promote",
      }).success,
    ).toBe(false);
  });
  it("only identifies canonical permitted clip platforms without loading embeds", () => {
    expect(clipLink("https://youtu.be/dQw4w9WgXcQ")?.label).toBe(
      "YouTube video",
    );
    expect(clipLink("https://clips.twitch.tv/HelpfulClip")?.label).toBe(
      "Twitch clip",
    );
    for (const url of [
      "http://youtu.be/dQw4w9WgXcQ",
      "https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ",
      "https://user:secret@youtube.com/watch?v=dQw4w9WgXcQ",
      "javascript:alert(1)",
      "https://youtube.com/redirect?url=https://evil.test",
    ])
      expect(clipLink(url)).toBeNull();
  });
});
describe("server media validation", () => {
  it("requires video rights and a complete actual supported MP4", async () => {
    const bytes = readFileSync("e2e/fixtures/development-test-clip.mp4");
    const file = new File([bytes], "test.mp4", { type: "video/mp4" });
    await expect(prepareSocialMedia(file, false)).rejects.toThrow(/permission/);
    const result = await prepareSocialMedia(file, true);
    expect(result.kind).toBe("video");
    expect(result.mime).toBe("video/mp4");
    expect(result.rights).toBe(true);
  });
  it("rejects forged videos, active files and oversized media", async () => {
    for (const [type, bytes] of [
      ["video/mp4", Buffer.from("<html>forged</html>")],
      ["image/svg+xml", Buffer.from('<svg onload="alert(1)"/>')],
      ["video/mp4", Buffer.alloc(3145729)],
    ] as const)
      await expect(
        prepareSocialMedia(new File([bytes], "fake", { type }), true),
      ).rejects.toThrow();
  });
});
