// @vitest-environment node
import { beforeEach, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  budget: vi.fn(),
  getUser: vi.fn(),
  createRoom: vi.fn(),
  deleteRoom: vi.fn(),
  remove: vi.fn(),
  issue: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/src/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: (name: string, ...args: unknown[]) =>
      name === "voice_request_budget"
        ? mocks.budget(...args)
        : mocks.rpc(name, ...args),
    auth: { getUser: mocks.getUser },
  }),
}));
vi.mock("@/src/lib/config", () => ({
  appOrigin: () => "https://app.example.test",
}));
vi.mock("@/src/lib/voice/server", () => ({
  voiceConfig: () => ({}),
  roomService: () => ({
    createRoom: mocks.createRoom,
    deleteRoom: mocks.deleteRoom,
  }),
  issueVoiceToken: mocks.issue,
  removeVoiceParticipant: mocks.remove,
  isMissingRoom: () => false,
}));
import { POST } from "../../../app/api/voice/[operation]/route";
const id = "a4000000-0000-4000-8000-000000000001";
const request = (
  operation: string,
  body: unknown,
  origin = "https://app.example.test",
) =>
  POST(
    new Request(`https://app.example.test/api/voice/${operation}`, {
      method: "POST",
      headers: { origin },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ operation }) },
  );
beforeEach(() => {
  vi.resetAllMocks();
  mocks.budget.mockResolvedValue({ data: true });
  mocks.getUser.mockResolvedValue({
    data: { user: { id, email_confirmed_at: "2026-01-01" } },
    error: null,
  });
  mocks.issue.mockResolvedValue({
    token: "short-lived-token",
    ticket: id,
    serverUrl: "wss://voice.example.test",
  });
});
it("rejects cross-origin and oversized requests before authentication", async () => {
  const rejected = await request("token", { channel: id }, "https://evil.invalid");
  expect(rejected.status).toBe(403);
  const message = (await rejected.json()).error;
  expect(message).toContain("This deployment expects https://app.example.test");
  expect(message).not.toContain("evil.invalid");
  expect(
    (await request("token", { channel: id, padding: "x".repeat(1500) })).status,
  ).toBe(400);
  expect(mocks.getUser).not.toHaveBeenCalled();
});
it("rejects arbitrary room names and forged identity or grant inputs", async () => {
  expect(
    (
      await request("token", {
        channel: id,
        identity: "victim",
        room: "global",
        grants: { roomAdmin: true },
      })
    ).status,
  ).toBe(400);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("requires a verified Supabase user independently of route protection", async () => {
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: Error() });
  expect((await request("token", { channel: id })).status).toBe(401);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("rejects unauthorized admission without contacting LiveKit", async () => {
  mocks.rpc.mockResolvedValue({ error: { code: "42501" } });
  expect((await request("token", { channel: id })).status).toBe(403);
  expect(mocks.createRoom).not.toHaveBeenCalled();
  expect(mocks.issue).not.toHaveBeenCalled();
});
it("rate limiting cannot create rooms or mint tokens", async () => {
  mocks.rpc.mockResolvedValue({ data: { limited: true } });
  expect((await request("token", { channel: id })).status).toBe(429);
  expect(mocks.createRoom).not.toHaveBeenCalled();
});
it("uses only server-derived room and authenticated identity, then rechecks admission", async () => {
  mocks.rpc
    .mockResolvedValueOnce({
      data: { room: "server-room", ticket: id, limit: 4, name: "Member" },
    })
    .mockResolvedValueOnce({ data: { allowed: true } });
  const response = await request("token", { channel: id });
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(mocks.createRoom).toHaveBeenCalledWith({
    name: "server-room",
    maxParticipants: 4,
    emptyTimeout: 120,
    departureTimeout: 30,
  });
  expect(mocks.issue).toHaveBeenCalledWith(
    id,
    expect.objectContaining({ room: "server-room" }),
  );
  expect(await response.json()).not.toHaveProperty("secret");
});
it("does not mint a token when access changes during external room creation", async () => {
  mocks.rpc
    .mockResolvedValueOnce({
      data: { room: "server-room", ticket: id, limit: 4, name: "Member" },
    })
    .mockResolvedValueOnce({ data: { allowed: false } })
    .mockResolvedValueOnce({ data: { allowed: false } });
  expect((await request("token", { channel: id })).status).toBe(503);
  expect(mocks.issue).not.toHaveBeenCalled();
  expect(mocks.rpc).toHaveBeenLastCalledWith("voice_session", {
    p_ticket: id,
    p_leave: true,
  });
});
it("moderator verification precedes server-side removal", async () => {
  mocks.rpc.mockResolvedValue({ error: { code: "42501" } });
  expect(
    (await request("control", { channel: id, operation: "remove", target: id }))
      .status,
  ).toBe(403);
  expect(mocks.remove).not.toHaveBeenCalled();
  mocks.rpc.mockResolvedValue({ data: { room: "trusted-room" } });
  expect(
    (await request("control", { channel: id, operation: "remove", target: id }))
      .status,
  ).toBe(200);
  expect(mocks.remove).toHaveBeenCalledWith("trusted-room", id);
});
it("removes only the authenticated identity on leave", async () => {
  mocks.rpc.mockResolvedValue({
    data: { room: "trusted-room", allowed: false },
  });
  expect((await request("leave", { ticket: id })).status).toBe(200);
  expect(mocks.remove).toHaveBeenCalledWith("trusted-room", id);
});

it("committed HTTP budget rejection stops even denied-attempt amplification", async () => {
  mocks.budget.mockResolvedValue({ data: false });
  expect((await request("token", { channel: id })).status).toBe(429);
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.createRoom).not.toHaveBeenCalled();
});
