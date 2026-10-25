// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ require: vi.fn(), rpc: vi.fn() }));
vi.mock("../auth/session", () => ({ requireUser: m.require }));
import { getPinnedMessages, setMessagePin } from "./pins";
const id = "a4000000-0000-4000-8000-000000000001";
beforeEach(() => { vi.clearAllMocks(); m.require.mockResolvedValue({ client: { rpc: m.rpc } }); });
it("rejects actor/role injection before calling the authenticated pin command", async () => {
  expect((await setMessagePin({ id, active: true, role: "owner" })).error).toBeTruthy();
  expect((await getPinnedMessages("invalid")).error).toBeTruthy(); expect(m.rpc).not.toHaveBeenCalled();
});
it("authenticates and returns only the committed server pin projection", async () => {
  m.rpc.mockResolvedValue({ data: { id, pinned_at: "2026-10-24T00:00:00Z" } });
  expect((await setMessagePin({ id, active: true })).data?.id).toBe(id);
  expect(m.require).toHaveBeenCalled(); expect(m.rpc).toHaveBeenCalledWith("set_message_pin", { p_message: id, p_active: true });
});
it("surfaces denied, missing-migration and transport errors without internal details", async () => {
  m.rpc.mockResolvedValueOnce({ error: { code: "42501", message: "private details" } });
  const result = await setMessagePin({ id, active: true }); expect(result.denied).toBe(true); expect(result.error).not.toContain("private details");
  m.rpc.mockResolvedValueOnce({ error: { code: "PGRST202" } }); expect((await getPinnedMessages(id)).error).toContain("database update");
  m.rpc.mockRejectedValueOnce(Error("network")); expect((await getPinnedMessages(id)).error).toContain("retry");
});
