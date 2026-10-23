// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import sharp from "sharp";
import { sendSchema, seqSchema, safeHref, messageLinks } from "./validation";
import { reconcileMessages } from "./reconcile";
import { prepareAttachment, safeFilename } from "./files";
import { isPublicAddress, publicPreviewUrl, extractPreview } from "./previews";
import type { ChatMessage } from "./types";
const id = "a4000000-0000-4000-8000-000000000001";
const valid = {
  id,
  channelId: id,
  body: "Hello",
  parentId: null,
  replyToId: null,
  attachments: [],
};
const row = (version: string, body = "text") =>
  ({ id, version, created_seq: "1", body }) as ChatMessage;
describe("Message validation and reconciliation", () => {
  it("rejects forged actors, missing content, oversized text and attachment lists", () => {
    for (const input of [
      { ...valid, authorId: id },
      { ...valid, body: "  " },
      { ...valid, body: "a".repeat(4001) },
      { ...valid, attachments: Array(5).fill(id) },
      { ...valid, id: "forged" },
    ])
      expect(sendSchema.safeParse(input).success).toBe(false);
  });
  it("permits file-only messages and ordinary multiline Markdown", () => {
    expect(
      sendSchema.safeParse({ ...valid, body: "", attachments: [id] }).success,
    ).toBe(true);
    expect(
      sendSchema.safeParse({ ...valid, body: "**Hello**\n\tworld" }).success,
    ).toBe(true);
  });
  it("rejects NUL and non-text control characters", () => {
    for (const code of [0, 1, 8, 11, 12, 14, 31])
      expect(
        sendSchema.safeParse({
          ...valid,
          body: `Hello${String.fromCharCode(code)}`,
        }).success,
      ).toBe(false);
  });
  it("bounds revision cursors without losing bigint precision", () => {
    expect(seqSchema.safeParse("9223372036854775807").success).toBe(true);
    expect(seqSchema.safeParse("9223372036854775808").success).toBe(false);
    expect(seqSchema.safeParse("-1").success).toBe(false);
  });
  it("deduplicates repeated delivery and preserves newer edits/tombstones", () => {
    const newest = { ...row("12", ""), deleted_at: "2026-10-24T00:00:00Z" };
    const result = reconcileMessages(
      [row("10")],
      [newest, row("11", "stale"), newest],
    );
    expect(result).toEqual([newest]);
  });
  it("orders using exact server sequences rather than browser clocks", () => {
    const other = {
      ...row("9007199254740994"),
      id: "other",
      created_seq: "9007199254740994",
    };
    const first = {
      ...row("9007199254740993"),
      created_seq: "9007199254740993",
    };
    expect(reconcileMessages([other], [first]).map((r) => r.id)).toEqual([
      id,
      "other",
    ]);
  });
  it("blocks executable/credentialed URLs and limits extracted links", () => {
    for (const href of [
      "javascript:alert(1)",
      "data:text/html,hi",
      "file:///etc/passwd",
      "https://user:pass@example.com/",
      "https://example.com\n.evil/",
    ])
      expect(safeHref(href)).toBeUndefined();
    expect(
      messageLinks("See https://example.com/a and https://example.com/a"),
    ).toEqual(["https://example.com/a"]);
  });
});
describe("File admission and transformations", () => {
  it("decodes and re-encodes photos as metadata-free WebP", async () => {
    const input = await sharp({
      create: { width: 20, height: 20, channels: 3, background: "#7350db" },
    })
      .png()
      .toBuffer();
    const result = await prepareAttachment(
      new File([input], "photo.png", { type: "image/png" }),
    );
    expect(result.mime).toBe("image/webp");
    expect(result.kind).toBe("photo");
    const meta = await sharp(result.buffer).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.exif).toBeUndefined();
  });
  it("rejects MIME-spoofed images, SVGs and executable files", async () => {
    for (const file of [
      new File(['<svg onload="alert(1)"></svg>'], "evil.png", {
        type: "image/png",
      }),
      new File(["MZ executable"], "evil.exe", {
        type: "application/octet-stream",
      }),
    ])
      await expect(prepareAttachment(file)).rejects.toThrow();
  });
  it("accepts GIF decoding and publishes only transformed image bytes", async () => {
    const bytes = Buffer.from(
      "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
      "base64",
    );
    const result = await prepareAttachment(
      new File([bytes], "tiny.gif", { type: "image/gif" }),
    );
    expect(result.mime).toBe("image/webp");
    expect((await sharp(result.buffer).metadata()).format).toBe("webp");
    // Two distinct 1px frames; identical frames are legitimately coalesced by WebP.
    const animated = Buffer.from(
      "47494638396101000100800000000000ffffff21ff0b4e45545343415045322e30030100000021f904000a0000002c000000000100010000020244010021f904000a0000002c00000000010001000002024c01003b",
      "hex",
    );
    const gif = await prepareAttachment(
      new File([animated], "animated.gif", { type: "image/gif" }),
    );
    expect(gif.kind).toBe("gif");
    expect((await sharp(gif.buffer, { animated: true }).metadata()).pages).toBe(
      2,
    );
  });
  it("bounds upload size and validates file signatures/text", async () => {
    await expect(
      prepareAttachment(
        new File([new Uint8Array(3 * 1024 * 1024 + 1)], "large.txt", {
          type: "text/plain",
        }),
      ),
    ).rejects.toThrow(/3 MB/);
    await expect(
      prepareAttachment(
        new File(["fake pdf"], "a.pdf", { type: "application/pdf" }),
      ),
    ).rejects.toThrow();
    await expect(
      prepareAttachment(
        new File(["<html><script>bad</script>"], "a.txt", {
          type: "text/plain",
        }),
      ),
    ).rejects.toThrow();
    const text = await prepareAttachment(
      new File(["name,game\nJordan,Minecraft"], "games.csv", {
        type: "text/csv",
      }),
    );
    expect(text.kind).toBe("file");
  });
  it("normalizes document extensions and preserves the database filename bound", async () => {
    const pdf = await prepareAttachment(
      new File(["%PDF-1.7\nminimal\n%%EOF"], "danger.html", {
        type: "application/pdf",
      }),
    );
    expect(pdf.filename).toBe("danger.pdf");
    const text = await prepareAttachment(
      new File(["ordinary text"], "a".repeat(120) + ".html", {
        type: "text/plain",
      }),
    );
    expect(text.filename).toMatch(/\.txt$/);
    expect(text.filename.length).toBeLessThanOrEqual(120);
  });
  it("strips path/control characters from display filenames", () => {
    const result = safeFilename("../../evil\r\n<script>.txt");
    expect(result).not.toContain("/");
    expect(result).not.toContain("<");
    expect(result).not.toContain("\n");
  });
});
describe("Link preview SSRF boundary", () => {
  it("rejects non-HTTPS, credentials, nonstandard ports, and local names", () => {
    for (const u of [
      "http://example.com",
      "https://example.com:8443",
      "https://user:pass@example.com",
      "https://localhost",
      "https://app.local",
      "file:///etc/passwd",
    ])
      expect(() => publicPreviewUrl(u)).toThrow();
  });
  it("rejects private, loopback, link-local, mapped, multicast and documentation addresses", () => {
    for (const ip of [
      "127.0.0.1",
      "10.0.0.1",
      "172.16.0.1",
      "192.168.0.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "224.0.0.1",
      "192.0.2.1",
      "::1",
      "fe80::1",
      "fd00::1",
      "::ffff:127.0.0.1",
      "2001:db8::1",
    ])
      expect(isPublicAddress(ip), ip).toBe(false);
    expect(isPublicAddress("93.184.216.34")).toBe(true);
  });
  it("extracts bounded text without retaining remote images or scripts", () => {
    const p = extractPreview(
      '<title>Fallback</title><meta property="og:title" content="Good &amp; Kind"><meta name="description" content="' +
        "a".repeat(500) +
        '"><meta property="og:image" content="https://tracker.invalid/a.png"><script>bad()</script>',
      "example.com",
    );
    expect(p.title).toBe("Good & Kind");
    expect(p.description).toHaveLength(300);
    expect(Object.keys(p)).toEqual(["hostname", "title", "description"]);
  });
});
