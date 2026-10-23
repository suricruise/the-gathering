// @vitest-environment node
import { it, expect, vi, beforeEach } from "vitest";
const m = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: m.getUser }, rpc: m.rpc }),
}));
import { spaceCommand } from "./actions";
const id = "a8000000-0000-4000-8000-000000000001";
beforeEach(() => {
  vi.resetAllMocks();
  m.getUser.mockResolvedValue({
    data: { user: { id, email_confirmed_at: "2026-10-23" } },
    error: null,
  });
});
it("rejects client actor/grant injection without a database call", async () => {
  expect(
    (
      await spaceCommand({
        operation: "rsvp",
        id,
        response: "going",
        actor: id,
      })
    ).error,
  ).toBeTruthy();
  expect(m.rpc).not.toHaveBeenCalled();
});
it("returns an authentication denial without redirecting background UI", async () => {
  m.getUser.mockResolvedValue({ data: { user: null }, error: null });
  expect((await spaceCommand({ operation: "notifications-read" })).denied).toBe(
    true,
  );
  expect(m.rpc).not.toHaveBeenCalled();
});
it("commits an independent attempt budget before identity-scoped commands", async () => {
  m.rpc
    .mockResolvedValueOnce({ data: true })
    .mockResolvedValueOnce({ data: { ok: true } });
  expect(
    (await spaceCommand({ operation: "rsvp", id, response: "going" })).data?.ok,
  ).toBe(true);
  expect(m.rpc.mock.calls).toEqual([
    ["space_budget", { p_operation: "request" }],
    [
      "space_command",
      { p_operation: "rsvp", p_data: { id, response: "going" } },
    ],
  ]);
});
it("does not claim success when rate limited, unauthorized or missing migrations", async () => {
  m.rpc.mockResolvedValueOnce({ data: false });
  expect(
    (await spaceCommand({ operation: "notifications-read" })).error,
  ).toMatch(/wait/);
  m.rpc
    .mockResolvedValueOnce({ data: true })
    .mockResolvedValueOnce({ error: { code: "42501" } });
  expect((await spaceCommand({ operation: "event-cancel", id })).denied).toBe(
    true,
  );
  m.rpc.mockResolvedValueOnce({ error: { code: "PGRST202" } });
  expect(
    (await spaceCommand({ operation: "notifications-read" })).error,
  ).toMatch(/Phase 10/);
});
