// @vitest-environment node
import { expect, it, vi, beforeEach } from "vitest";
const mock = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../auth/session", () => ({ requireUser: async () => ({ client: mock, user: { id: "member" } }) }));
import { communityIndex } from "./data";
beforeEach(() => { vi.resetAllMocks(); mock.rpc.mockImplementation(async (name) => name === "community_directory" ? { data: null, error: { code: "PGRST202" } } : { data: true, error: null }); });
it("retains the authorized directory while the additive header migration is pending", async () => {
 const base = { id: "community", slug: "gathering", name: "Gathering", cover: "nebula" };
 let reads = 0;
 mock.from.mockImplementation((table) => {
  if (table === "community_members") return { select: () => ({ eq: async () => ({ data: [], error: null }) }) };
  const value = ++reads === 1 ? { data: null, error: { code: "PGRST200" } } : { data: [base], error: null };
  return { select: () => ({ order: () => ({ limit: () => ({ returns: async () => value }) }) }) };
 });
 const result = await communityIndex();
 expect(result?.communities).toEqual([base]); expect(reads).toBe(2);
});
it("does not retry or bypass authorization and other database errors", async () => {
 let reads = 0;
 mock.from.mockImplementation((table) => {
  if (table === "community_members") return { select: () => ({ eq: async () => ({ data: [], error: null }) }) };
  reads++;
  return { select: () => ({ order: () => ({ limit: () => ({ returns: async () => ({ data: null, error: { code: "42501" } }) }) }) }) };
 });
 expect(await communityIndex()).toBeNull(); expect(reads).toBe(1);
});
it("preserves the server-authorized display order without client resorting", async () => {
 const communities = [{ id: "z", name: "Z first", display_order: 0 }, { id: "a", name: "A second", display_order: 1 }];
 mock.rpc.mockImplementation(async (name) => name === "community_directory" ? { data: communities, error: null } : { data: true, error: null });
 mock.from.mockReturnValue({ select: () => ({ eq: async () => ({ data: [], error: null }) }) });
 expect((await communityIndex())?.communities).toEqual(communities);
 expect(mock.from).toHaveBeenCalledTimes(1);
});
it("does not bypass a denied ordered directory by retrying the table", async () => {
 mock.rpc.mockImplementation(async (name) => name === "community_directory" ? { data: null, error: { code: "42501" } } : { data: true, error: null });
 mock.from.mockReturnValue({ select: () => ({ eq: async () => ({ data: [], error: null }) }) });
 expect(await communityIndex()).toBeNull();
 expect(mock.from).toHaveBeenCalledTimes(1);
});
