// @vitest-environment node
import { it, expect, vi, beforeEach } from "vitest";
const m = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/src/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: m.getUser }, rpc: m.rpc }),
}));
import { GET } from "../../../app/api/spaces/route";
const get = (q = "view=notifications") =>
  GET(new Request("https://app.test/api/spaces?" + q));
beforeEach(() => {
  vi.resetAllMocks();
  m.getUser.mockResolvedValue({
    data: { user: { id: "verified", email_confirmed_at: "2026-10-23" } },
    error: null,
  });
  m.rpc.mockResolvedValue({ data: { items: [] }, error: null });
});
it("rejects invalid views and cursor/identity injection before lookup", async () => {
  expect((await get("view=audit")).status).toBe(400);
  expect((await get("view=notifications&user_id=victim")).status).toBe(400);
  expect(m.getUser).not.toHaveBeenCalled();
});
it("expired/unverified sessions get JSON denial rather than navigation", async () => {
  m.getUser.mockResolvedValue({ data: { user: null }, error: null });
  const r = await get();
  expect(r.status).toBe(401);
  expect(r.headers.get("location")).toBeNull();
  expect(m.rpc).not.toHaveBeenCalled();
});
it("uses private no-store caching and lets database independently enforce recipients", async () => {
  const r = await get();
  expect(r.status).toBe(200);
  expect(r.headers.get("cache-control")).toBe("private, no-store");
  expect(m.rpc).toHaveBeenCalledWith("space_read", {
    p_view: "notifications",
    p_resource: null,
    p_community: null,
    p_before: null,
    p_filter: "all",
  });
  m.rpc.mockResolvedValue({ error: { code: "42501" } });
  expect((await get()).status).toBe(403);
});
