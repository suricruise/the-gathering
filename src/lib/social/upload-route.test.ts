// @vitest-environment node
import { beforeEach, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  admin: vi.fn(),
  read: vi.fn(),
  prepare: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/src/lib/config", () => ({
  appOrigin: () => "https://app.example.test",
}));
vi.mock("@/src/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
    rpc: mocks.rpc,
  }),
}));
vi.mock("@/src/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/src/lib/chat/files", () => ({ readUploadForm: mocks.read }));
vi.mock("@/src/lib/social/media", () => ({
  prepareSocialMedia: mocks.prepare,
}));
import { POST } from "../../../app/api/social/upload/route";
const request = (origin: string | null) =>
  POST(
    new Request("https://app.example.test/api/social/upload", {
      method: "POST",
      headers: origin === null ? {} : { origin },
    }),
  );
beforeEach(() => {
  vi.resetAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
});
it.each([
  ["https://preview.example.test", "https://preview.example.test"],
  [null, "missing"],
  ["null", "opaque/null"],
  ["https://user:secret@evil.test/path?token=private", "invalid"],
  ["https://evil.test/path?token=private", "invalid"],
  ["https://evil.test#private", "invalid"],
  ["x".repeat(300), "invalid"],
])(
  "rejects untrusted upload origin %s with safe diagnostics",
  async (origin, label) => {
    const response = await request(origin);
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const { error } = await response.json();
    expect(error).toContain(
      "This deployment expects https://app.example.test.",
    );
    expect(error).toContain(`Browser sent: ${label}.`);
    expect(error).not.toMatch(/secret|token=|private|\/path/);
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
  },
);
it("still requires authentication for a matching origin before reading files", async () => {
  const response = await request("https://app.example.test");
  expect(response.status).toBe(401);
  expect(mocks.getUser).toHaveBeenCalledOnce();
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.read).not.toHaveBeenCalled();
  expect(mocks.admin).not.toHaveBeenCalled();
});
