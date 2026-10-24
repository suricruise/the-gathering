import { afterEach, expect, it, vi } from "vitest";
import { uploadChatFile } from "./upload-client";
import { attachmentError, mentionAt } from "./composer";
afterEach(() => vi.unstubAllGlobals());
it("validates size/type hints and only recognizes caret-local username mentions", () => {
  expect(attachmentError({ size: 0, type: "image/png" })).toContain("nonempty");
  expect(attachmentError({ size: 3 * 1024 * 1024 + 1, type: "image/png" })).toContain("3 MB");
  expect(attachmentError({ size: 600000, type: "text/plain" })).toContain("512 KB");
  expect(attachmentError({ size: 4, type: "image/svg+xml" })).toContain("Supported");
  expect(mentionAt("email@test", 10)).toBeNull();
  expect(mentionAt("Hello @tay and more", 10)).toEqual({ query: "tay", start: 6, end: 10 });
});
it("reports byte progress, waits for validated server metadata and rejects bad responses", async () => {
  const instances: FakeXHR[] = [];
  const current = () => instances.at(-1)!;
  class FakeXHR {
    upload: { onprogress?: (event: { loaded: number; total: number; lengthComputable: boolean }) => void } = {};
    timeout = 0; status = 200; responseText = "";
    onload = () => {}; onerror = () => {}; onabort = () => {}; ontimeout = () => {};
    open = vi.fn(); send = vi.fn(); abort = vi.fn(() => this.onabort());
    constructor() { instances.push(this); }
  }
  vi.stubGlobal("XMLHttpRequest", FakeXHR);
  const progress = vi.fn();
  const first = uploadChatFile("channel", new File(["hello"], "note.txt"), progress);
  current().upload.onprogress!({ loaded: 5, total: 10, lengthComputable: true });
  expect(progress).toHaveBeenCalledWith(50);
  current().responseText = JSON.stringify({ id: "a4000000-0000-4000-8000-000000000001", filename: "note.txt", mime: "text/plain", kind: "file", byte_size: 5 });
  current().onload(); await expect(first.result).resolves.toHaveProperty("filename", "note.txt");
  const bad = uploadChatFile("channel", new File(["x"], "x"), progress);
  current().responseText = "{}"; current().onload(); await expect(bad.result).rejects.toThrow("confirmed");
  const rejected = uploadChatFile("channel", new File(["x"], "x"), progress);
  current().status = 403; current().responseText = '{"error":"Upload denied"}'; current().onload();
  await expect(rejected.result).rejects.toThrow("Upload denied");
  const cancelled = uploadChatFile("channel", new File(["x"], "x"), progress);
  cancelled.abort(); await expect(cancelled.result).rejects.toThrow("cancelled");
});
