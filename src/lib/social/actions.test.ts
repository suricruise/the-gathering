// @vitest-environment node
import { it, expect, vi, beforeEach } from "vitest";
const mocks = vi.hoisted(() => ({
  require: vi.fn(),
  rpc: vi.fn(),
  adminRpc: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("../auth/session", () => ({ requireUser: mocks.require }));
vi.mock("../supabase/admin", () => ({
  createAdminClient: () => ({ rpc: mocks.adminRpc }),
}));
vi.mock("../chat/previews", () => ({ fetchLinkPreview: mocks.fetch }));
import { socialCommand, getSocialFeed, socialPreviews } from "./actions";
const id = "a4000000-0000-4000-8000-000000000001",
  post = {
    operation: "create",
    id,
    body: "Real",
    audience: "members",
    community: null,
    games: [],
    interests: [],
    media: [],
  };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.require.mockResolvedValue({
    client: { rpc: mocks.rpc },
    user: { id: "verified" },
  });
});
it("rejects forged identity inputs before database calls", async () => {
  expect(
    (await socialCommand({ ...post, author_id: "forged" })).error,
  ).toBeTruthy();
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("independently verifies identity for valid operations", async () => {
  mocks.require.mockRejectedValue(Error("Sign in"));
  await expect(socialCommand(post)).rejects.toThrow();
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("commits a separate request budget before creating and never supplies a caller-selected actor", async () => {
  mocks.rpc
    .mockResolvedValueOnce({ data: true })
    .mockResolvedValueOnce({ data: { id } });
  expect((await socialCommand(post)).data?.id).toBe(id);
  expect(mocks.rpc).toHaveBeenNthCalledWith(1, "social_budget", {
    p_operation: "post",
  });
  expect(mocks.rpc).toHaveBeenNthCalledWith(2, "social_command", {
    p_operation: "create",
    p_data: expect.not.objectContaining({ author_id: expect.anything() }),
  });
});
it("rejects exhausted or missing budgets without claiming success", async () => {
  mocks.rpc.mockResolvedValue({ data: false });
  expect((await socialCommand(post)).error).toMatch(/wait/);
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
  mocks.rpc.mockResolvedValue({ error: { code: "PGRST202" } });
  expect((await socialCommand(post)).error).toMatch(/migrations/);
});
it("validates cursors and filters before reading feeds", async () => {
  expect((await getSocialFeed({ mode: "all-private" })).error).toBeTruthy();
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("unauthorized posts never cause an external preview request", async () => {
  mocks.rpc.mockResolvedValue({ data: null });
  expect((await socialPreviews(id)).error).toBeTruthy();
  expect(mocks.fetch).not.toHaveBeenCalled();
  expect(mocks.adminRpc).not.toHaveBeenCalled();
});
it("preview writes carry the exact authorized body for race-safe server revalidation", async () => {
  mocks.rpc
    .mockResolvedValueOnce({
      data: { id, status: "published", body: "https://public.example/" },
    })
    .mockResolvedValueOnce({ data: true })
    .mockResolvedValueOnce({ data: { id, status: "published" } });
  mocks.fetch.mockResolvedValue({
    url: "https://public.example/",
    title: "Safe title",
    description: "Text",
    hostname: "public.example",
  });
  mocks.adminRpc.mockResolvedValue({ data: true });
  expect((await socialPreviews(id)).data?.id).toBe(id);
  expect(mocks.adminRpc).toHaveBeenCalledWith(
    "store_post_preview",
    expect.objectContaining({ p_post: id, p_body: "https://public.example/" }),
  );
});
