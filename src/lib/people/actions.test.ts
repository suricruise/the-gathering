// @vitest-environment node
import { beforeEach, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  getUser: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("../supabase/server", () => ({ createClient: mocks.create }));
import { peopleCommand, directHistory, searchPeople } from "./actions";
const id = "a8000000-0000-4000-8000-000000000001";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.create.mockResolvedValue({
    rpc: mocks.rpc,
    auth: { getUser: mocks.getUser },
  });
  mocks.getUser.mockResolvedValue({
    data: { user: { id: "verified", email_confirmed_at: "2026-10-23" } },
    error: null,
  });
});
it("validates before auth or database calls", async () => {
  expect(
    (
      await peopleCommand({
        operation: "send",
        conversation: id,
        id,
        body: "Hi",
        sender: "victim",
      })
    ).error,
  ).toBeTruthy();
  expect((await directHistory({ conversation: "guessed" })).denied).toBe(true);
  expect(
    (await searchPeople({ query: "email@example.test" })).error,
  ).toBeTruthy();
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("checks identity then commits a distinct attempt budget before mutation", async () => {
  mocks.rpc
    .mockResolvedValueOnce({ data: true })
    .mockResolvedValueOnce({ data: { ok: true } });
  expect(
    (await peopleCommand({ operation: "request", target: id })).data?.ok,
  ).toBe(true);
  expect(mocks.getUser).toHaveBeenCalledTimes(1);
  expect(mocks.rpc.mock.calls).toEqual([
    ["people_budget", { p_operation: "control" }],
    ["people_command", { p_operation: "request", p_data: { target: id } }],
  ]);
});
it("exhausted budget stops action without claiming success", async () => {
  mocks.rpc.mockResolvedValueOnce({ data: false });
  expect(
    (await peopleCommand({ operation: "open", target: id })).error,
  ).toMatch(/wait/);
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
});
it("authorization failure clears access rather than manufacturing history", async () => {
  mocks.rpc.mockResolvedValueOnce({ error: { code: "42501" } });
  expect(await directHistory({ conversation: id })).toMatchObject({
    denied: true,
    error: expect.stringContaining("unavailable"),
  });
});

it("missing or unverified sessions return denial without redirecting background work", async () => {
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
  expect((await directHistory({ conversation: id })).denied).toBe(true);
  expect((await peopleCommand({ operation: "heartbeat" })).denied).toBe(true);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
