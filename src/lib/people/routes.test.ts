// @vitest-environment node
import { beforeEach, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getSession: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/src/lib/config", () => ({
  appOrigin: () => "https://app.example.test",
}));
vi.mock("@/src/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser, getSession: mocks.getSession },
    rpc: mocks.rpc,
  }),
}));
import { GET, POST } from "../../../app/api/people/data/route";
import { GET as SESSION } from "../../../app/api/people/session/route";
const id = "a8000000-0000-4000-8000-000000000001";
const get = (query = "") =>
  GET(new Request("https://app.example.test/api/people/data" + query));
const post = (origin: string | null = "https://app.example.test") =>
  POST(
    new Request("https://app.example.test/api/people/data", {
      method: "POST",
      headers: origin ? { origin } : {},
    }),
  );
beforeEach(() => {
  vi.resetAllMocks();
  mocks.getUser.mockResolvedValue({
    data: { user: { id, email_confirmed_at: "2026-10-23" } },
    error: null,
  });
  mocks.getSession.mockResolvedValue({
    data: { session: { access_token: "test-access-token" } },
  });
  mocks.rpc.mockResolvedValue({ data: {}, error: null });
});
it("background reads return JSON denial rather than a redirect after session loss", async () => {
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
  for (const call of [() => get(), () => post()]) {
    const r = await call();
    expect(r.status).toBe(401);
    expect(r.headers.get("location")).toBeNull();
    expect((await r.json()).denied).toBe(true);
  }
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("unverified users cannot read or heartbeat", async () => {
  mocks.getUser.mockResolvedValue({ data: { user: { id } }, error: null });
  expect((await get()).status).toBe(401);
  expect((await post()).status).toBe(401);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("background reads use identity-scoped RPCs and private no-store caching", async () => {
  const r = await get("?user=victim");
  expect(r.status).toBe(200);
  expect(r.headers.get("cache-control")).toBe("private, no-store");
  expect(mocks.rpc).toHaveBeenCalledWith("people_home");
});
it("validates history cursors and never forwards arbitrary identity or grants", async () => {
  expect((await get("?conversation=guessed")).status).toBe(400);
  expect(mocks.rpc).not.toHaveBeenCalled();
  await get(`?conversation=${id}&before=123&role=admin`);
  expect(mocks.rpc).toHaveBeenCalledWith("dm_history", {
    p_conversation: id,
    p_before: "123",
  });
});
it.each([null, "https://evil.example.test"])(
  "rejects heartbeat origin %s before auth",
  async (origin) => {
    expect((await post(origin)).status).toBe(403);
    expect(mocks.getUser).not.toHaveBeenCalled();
  },
);
it("heartbeat is rate limited and never accepts client-chosen identity or timestamps", async () => {
  mocks.rpc.mockResolvedValue({ data: { limited: true }, error: null });
  expect((await post()).status).toBe(429);
  expect(mocks.rpc).toHaveBeenCalledWith("people_command", {
    p_operation: "heartbeat",
    p_data: {},
  });
});
it("history authorization denial is distinct from a transient unavailable service", async () => {
  mocks.rpc.mockResolvedValue({ error: { code: "42501" } });
  const denied = await get(`?conversation=${id}`);
  expect(denied.status).toBe(403);
  expect((await denied.json()).denied).toBe(true);
  mocks.rpc.mockResolvedValue({ error: { code: "PGRST202" } });
  const failure = await get();
  expect(failure.status).toBe(503);
  expect((await failure.json()).denied).toBe(false);
});
it("Realtime credentials require explicit authorization before reading a session token", async () => {
  mocks.rpc.mockResolvedValue({ data: false });
  const r = await SESSION(
    new Request(
      `https://app.example.test/api/people/session?conversation=${id}`,
    ),
  );
  expect(r.status).toBe(403);
  expect(mocks.getSession).not.toHaveBeenCalled();
});
it("private notification credentials are scoped to the verified user and never include refresh secrets", async () => {
  mocks.rpc.mockResolvedValue({ data: true });
  const r = await SESSION(
    new Request("https://app.example.test/api/people/session"),
  );
  expect(mocks.rpc).toHaveBeenCalledWith("people_topic_allowed", {
    p_topic: "people:" + id,
  });
  expect(await r.json()).toEqual({
    topic: "people:" + id,
    access_token: "test-access-token",
  });
  expect(r.headers.get("cache-control")).toBe("private, no-store");
});
