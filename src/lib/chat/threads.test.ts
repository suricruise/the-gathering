// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ require: vi.fn(), rpc: vi.fn() }));
vi.mock("../auth/session", () => ({ requireUser: m.require }));
import { getThreadPage } from "./threads";
const channelId = "a4000000-0000-4000-8000-000000000001", parentId = "a4000000-0000-4000-8000-000000000002";
beforeEach(() => { vi.resetAllMocks(); m.require.mockResolvedValue({ client: { rpc: m.rpc } }); });
it("rejects forged actors and invalid cursors before database access", async () => {
  expect((await getThreadPage({ channelId, parentId, userId: "forged" })).error).toBeTruthy();
  expect((await getThreadPage({ channelId, parentId, before: "-1" })).error).toBeTruthy(); expect(m.rpc).not.toHaveBeenCalled();
});
it("authenticates bounded thread history and preserves bigint cursors", async () => {
  m.rpc.mockResolvedValue({ data: { root: { id: parentId, channel_id: channelId, parent_id: null }, messages: [] } });
  expect((await getThreadPage({ channelId, parentId, before: "9007199254740993" })).data).toBeTruthy();
  expect(m.require).toHaveBeenCalled(); expect(m.rpc).toHaveBeenCalledWith("channel_thread_page", { p_channel: channelId, p_parent: parentId, p_before: "9007199254740993" });
});
it("rejects an unexpected cross-channel projection and surfaces live access revocation", async () => {
  m.rpc.mockResolvedValueOnce({ data: { root: { id: parentId, channel_id: parentId, parent_id: null }, messages: [] } });
  expect((await getThreadPage({ channelId, parentId })).data).toBeUndefined();
  m.rpc.mockResolvedValueOnce({ error: { code: "42501", message: "private detail" } }); const result = await getThreadPage({ channelId, parentId }); expect(result.denied).toBe(true); expect(result.error).not.toContain("private detail");
});
