// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
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
afterEach(() => vi.restoreAllMocks());
beforeEach(() => { vi.resetAllMocks(); vi.spyOn(console, "error").mockImplementation(() => {}); mocks.user.mockResolvedValue({ data: { user: { id, email_confirmed_at: "2026-01-01" } }, error: null }); });
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

it("reports oversized multipart bodies as validation errors rather than unavailable services", async () => {
 mocks.rpc.mockResolvedValue({ data: "allowed", error: null }); mocks.admin.mockReturnValue({});
 const form = new FormData();
 form.set("file", new File([new Uint8Array(4*1024*1024)], "large.png", { type: "image/png" }));
 const encoded = new Request("https://gathering.test/api/communities/header", { method: "POST", body: form });
 const bytes = await encoded.arrayBuffer();
 const result = await POST(new Request(encoded.url, { method: "POST", headers: { origin: "https://gathering.test", "content-type": encoded.headers.get("content-type")! }, body: bytes }), context);
 expect(result.status).toBe(413); expect((await result.json()).error).toContain("3 MB");
 expect(mocks.rpc).toHaveBeenCalledTimes(1);
});
it("explains a missing header migration without touching privileged storage", async () => {
 mocks.rpc.mockResolvedValue({ error: { code: "PGRST202", message: "private provider contents" }, data: null });
 const result = await POST(request(), context);
 expect(result.status).toBe(503); expect((await result.json()).error).toContain("database update");
 expect(mocks.admin).not.toHaveBeenCalled();
 expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("private provider contents");
});
it("distinguishes missing server storage configuration", async () => {
 mocks.rpc.mockResolvedValue({ data: "allowed", error: null });
 mocks.admin.mockImplementation(() => { throw Error("secret provider details"); });
 const result = await POST(request(), context);
 expect(result.status).toBe(503); expect((await result.json()).error).toContain("SUPABASE_SECRET_KEY");
 expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("secret provider details");
});
it("does not report an already committed removal as failed when old-object cleanup throws", async () => {
 mocks.rpc.mockResolvedValueOnce({ data: "allowed", error: null }).mockResolvedValueOnce({ data: "old.webp", error: null });
 const remove = vi.fn().mockRejectedValue(Error("provider unavailable"));
 mocks.admin.mockReturnValue({ storage: { from: () => ({ remove }) } });
 const result = await DELETE(request("https://gathering.test", "DELETE"), context);
 expect(result.status).toBe(200); expect((await result.json()).notice).toBe("Custom header removed.");
});
