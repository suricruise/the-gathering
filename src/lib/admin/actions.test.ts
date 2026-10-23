// @vitest-environment node
import { beforeEach, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn() }));
vi.mock("../supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: m.getUser }, rpc: m.rpc }),
}));
import { adminRead, adminCommand, submitReport, submitAppeal } from "./actions";
const id = "83117fa4-a337-4b40-93df-617d9d8e8014";
beforeEach(() => {
  vi.resetAllMocks();
  m.getUser.mockResolvedValue({
    data: { user: { id, email_confirmed_at: "2026-10-23" } },
    error: null,
  });
  m.rpc.mockResolvedValue({ data: { ok: true }, error: null });
});
it("rejects malformed actions before contacting auth or SQL", async () => {
  expect(
    (
      await adminCommand({
        operation: "platform_role",
        user_id: id,
        role: "owner",
        reason: "Self appointed",
      })
    ).error,
  ).toBeTruthy();
  expect(m.getUser).not.toHaveBeenCalled();
});
it("independently verifies the authenticated identity", async () => {
  m.getUser.mockResolvedValue({ data: { user: null }, error: null });
  expect((await adminRead({ view: "members" })).error).toMatch(/Sign in/);
  expect(m.rpc).not.toHaveBeenCalled();
});
it("delegates authorization to transactional RPC without trusting user IDs as actors", async () => {
  await adminCommand({
    operation: "platform_role",
    user_id: id,
    role: "moderator",
    reason: "Reviewed appointment",
  });
  expect(m.rpc).toHaveBeenCalledWith("admin_command", {
    p_operation: "platform_role",
    p_data: { user_id: id, role: "moderator", reason: "Reviewed appointment" },
  });
});
it("returns safe permission errors without SQL or evidence details", async () => {
  m.rpc.mockResolvedValue({
    error: { code: "42501", message: "private evidence secret" },
  });
  const r = await adminRead({ view: "reports" });
  expect(r.error).toMatch(/permission/);
  expect(JSON.stringify(r)).not.toContain("secret");
});
it("report and appeal payloads cannot forge roles or evidence", async () => {
  await submitReport({
    type: "message",
    target: id,
    reason: "Please review this item",
  });
  expect(m.rpc).toHaveBeenCalledWith("submit_report", {
    p_type: "message",
    p_target: id,
    p_reason: "Please review this item",
  });
  await submitAppeal({ body: "Please reconsider this decision." });
  expect(m.rpc).toHaveBeenCalledWith("submit_appeal", {
    p_body: "Please reconsider this decision.",
    p_case: null,
  });
});
