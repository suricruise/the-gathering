// @vitest-environment node
import { beforeEach, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({ require: vi.fn(), rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../auth/session", () => ({ requireUser: mocks.require }));
import { squadCommand, getSquads, getSquad } from "./actions";
const id = "a8000000-0000-4000-8000-000000000001";
const input = { operation: "join", session: id, platform: "pc" };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.require.mockResolvedValue({
    client: { rpc: mocks.rpc },
    user: { id: "verified-user" },
  });
});
it("validates before dispatch and never forwards client identities or roles", async () => {
  for (const extra of [
    { user_id: "victim" },
    { role: "host" },
    { host_id: "victim" },
  ])
    expect((await squadCommand({ ...input, ...extra })).error).toBeTruthy();
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("independently verifies identity and commits a separate attempt budget", async () => {
  mocks.rpc
    .mockResolvedValueOnce({ data: true })
    .mockResolvedValueOnce({ data: { id, status: "pending" } });
  const r = await squadCommand(input);
  expect(r.data?.status).toBe("pending");
  expect(mocks.require).toHaveBeenCalledWith("/squad-up");
  expect(mocks.rpc.mock.calls).toEqual([
    ["squad_budget", { p_operation: "join" }],
    [
      "squad_command",
      { p_operation: "join", p_data: { session: id, platform: "pc" } },
    ],
  ]);
});
it("stops on failed or exhausted budgets without a false reservation", async () => {
  mocks.rpc.mockResolvedValueOnce({ error: { code: "PGRST202" } });
  expect((await squadCommand(input)).error).toMatch(/unavailable/);
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
  mocks.rpc.mockClear();
  mocks.rpc.mockResolvedValueOnce({ data: false });
  expect((await squadCommand(input)).error).toMatch(/wait/);
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
});
it.each([
  ["54000", "full"],
  ["55000", "ended"],
  ["42501", "unavailable"],
])("returns honest %s mutation errors", async (code, message) => {
  mocks.rpc
    .mockResolvedValueOnce({ data: true })
    .mockResolvedValueOnce({ error: { code } });
  const r = await squadCommand(input);
  expect(r.data).toBeUndefined();
  expect(r.error).toContain(message);
});
it("rejects invalid filters and UUIDs before service reads", async () => {
  expect((await getSquads({ slots: 100 })).error).toBeTruthy();
  expect((await getSquad("guessed-name")).error).toBeTruthy();
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("returns the same unavailable state for missing and forbidden detail rows", async () => {
  mocks.rpc.mockResolvedValueOnce({ data: null });
  const missing = await getSquad(id);
  mocks.rpc.mockResolvedValueOnce({ error: { code: "42501" } });
  expect(await getSquad(id)).toEqual(missing);
});
