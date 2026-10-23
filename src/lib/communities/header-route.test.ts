// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), rpc: vi.fn(), admin: vi.fn(), from: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/src/lib/config", () => ({ appOrigin: () => "https://gathering.test" }));
vi.mock("@/src/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mocks.user }, rpc: mocks.rpc, from: mocks.from }) }));
vi.mock("@/src/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
import { POST, DELETE, GET } from "../../../app/api/communities/[id]/header/route";
const id = "55555555-5555-4555-8555-555555555555";
const context = { params: Promise.resolve({ id }) };
const request = (origin = "https://gathering.test", method = "POST") => new Request(`https://gathering.test/api/communities/${id}/header`, { method, headers: { origin } });
beforeEach(() => { vi.resetAllMocks(); mocks.user.mockResolvedValue({ data: { user: { id, email_confirmed_at: "2026-01-01" } }, error: null }); });
it("rejects cross-origin uploads before authentication or storage", async () => {
 expect((await POST(request("https://attacker.test"), context)).status).toBe(403);
 expect(mocks.user).not.toHaveBeenCalled(); expect(mocks.admin).not.toHaveBeenCalled();
});
it("rejects unauthenticated uploads and conceals image existence", async () => {
 mocks.user.mockResolvedValue({ data: { user: null }, error: null });
 expect((await POST(request(), context)).status).toBe(401);
 expect((await GET(request(), context)).status).toBe(404);
 expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.admin).not.toHaveBeenCalled();
});
it("checks live database permissions before reading upload bytes or accessing storage", async () => {
 mocks.rpc.mockResolvedValue({ error: { code: "42501" }, data: null });
 expect((await POST(request(), context)).status).toBe(403);
 expect(mocks.rpc).toHaveBeenCalledWith("community_header_command", { p_community: id, p_operation: "check" });
 expect(mocks.admin).not.toHaveBeenCalled();
});
it("rejects unauthorized removal without invoking privileged storage", async () => {
 mocks.rpc.mockResolvedValue({ error: null, data: null });
 expect((await DELETE(request("https://gathering.test", "DELETE"), context)).status).toBe(403);
 expect(mocks.admin).not.toHaveBeenCalled();
});
it("uses caller RLS to conceal private images before privileged download", async () => {
 mocks.from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) });
 expect((await GET(request(), context)).status).toBe(404);
 expect(mocks.admin).not.toHaveBeenCalled();
});
