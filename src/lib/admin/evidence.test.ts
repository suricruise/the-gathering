// @vitest-environment node
import { beforeEach, it, vi, expect } from "vitest";
const m = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  download: vi.fn(),
  admin: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/src/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: m.getUser }, rpc: m.rpc }),
}));
vi.mock("@/src/lib/supabase/admin", () => ({
  createAdminClient: () => {
    m.admin();
    return { storage: { from: () => ({ download: m.download }) } };
  },
}));
import { GET } from "../../../app/api/admin/evidence/[id]/route";
const id = "83117fa4-a337-4b40-93df-617d9d8e8014",
  get = (value = id) =>
    GET(new Request("https://app.test/api/admin/evidence/" + value), {
      params: Promise.resolve({ id: value }),
    });
beforeEach(() => {
  vi.resetAllMocks();
  m.getUser.mockResolvedValue({
    data: { user: { email_confirmed_at: "now" } },
    error: null,
  });
  m.rpc.mockResolvedValue({
    data: {
      bucket: "message-files",
      storage_path: "private/original",
      filename: "reported.webp",
      mime: "image/webp",
    },
    error: null,
  });
  m.download.mockResolvedValue({ data: new Blob(["webp"]), error: null });
});
it("invalid identifiers and unverified sessions cannot touch privileged storage", async () => {
  expect((await get("invalid")).status).toBe(404);
  m.getUser.mockResolvedValue({ data: { user: null }, error: null });
  expect((await get()).status).toBe(404);
  expect(m.admin).not.toHaveBeenCalled();
});
it("fresh database authorization denial never reaches service storage", async () => {
  m.rpc.mockResolvedValue({ error: { code: "42501" } });
  expect((await get()).status).toBe(404);
  expect(m.admin).not.toHaveBeenCalled();
});
it("streams only database-authorized private objects with no-store and safe headers", async () => {
  const r = await get();
  expect(r.status).toBe(200);
  expect(r.headers.get("cache-control")).toBe("private, no-store");
  expect(r.headers.get("vary")).toBe("Cookie");
  expect(r.headers.get("content-type")).toBe("image/webp");
  expect(r.headers.get("x-content-type-options")).toBe("nosniff");
  expect(m.rpc).toHaveBeenCalledWith("admin_evidence_file", { p_id: id });
  expect(m.download).toHaveBeenCalledWith("private/original");
});
it("non-image evidence is downloaded, never executed as active HTML", async () => {
  m.rpc.mockResolvedValue({
    data: {
      bucket: "social-media",
      storage_path: "private/original",
      filename: "clip.mp4",
      mime: "video/mp4",
    },
  });
  const r = await get();
  expect(r.headers.get("content-type")).toBe("application/octet-stream");
  expect(r.headers.get("content-disposition")).toMatch(/^attachment/);
});
