// @vitest-environment node
import { beforeEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  rpc: vi.fn(),
  origin: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("../auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("../config", () => ({ appOrigin: mocks.origin }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { communityAction } from "./actions";
import { parseCommand } from "./validation";
const communityId = "a4000000-0000-4000-8000-000000000001";
function form(
  operation: string,
  values: Record<string, string | undefined> = {},
) {
  const f = new FormData();
  Object.entries({ operation, community_id: communityId, ...values }).forEach(
    ([k, v]) => {
      if (v !== undefined) f.set(k, v);
    },
  );
  return f;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({
    user: { id: "verified-actor" },
    client: { rpc: mocks.rpc },
  });
  mocks.rpc.mockResolvedValue({
    data: { id: communityId, slug: "the-gathering" },
    error: null,
  });
  mocks.origin.mockReturnValue("https://gathering.example");
});
describe("Community server commands", () => {
  it("requires a verified server session for every mutation", async () => {
    mocks.requireUser.mockRejectedValue(new Error("redirect"));
    await expect(communityAction({}, form("join"))).rejects.toThrow();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects client-selected actors and extra roles", async () => {
    const result = await communityAction(
      {},
      form("join", { actor_id: "forged", role: "owner" }),
    );
    expect(result.error).toBeTruthy();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("passes the verified-session RPC no actor or trusted client role", async () => {
    await communityAction({}, form("join"));
    expect(mocks.rpc).toHaveBeenCalledWith("community_command", {
      p_operation: "join",
      p_community: communityId,
      p_data: {},
    });
  });
  it("never simulates success when RLS/database denies a command", async () => {
    mocks.rpc.mockResolvedValue({
      error: { message: "private database detail" },
      data: null,
    });
    const result = await communityAction({}, form("join"));
    expect(result.error).toBeTruthy();
    expect(result.notice).toBeUndefined();
    expect(result.error).not.toContain("private database detail");
  });
  it("generates unpredictable invitation links and sends only their digest to SQL", async () => {
    const a = await communityAction({}, form("invite"));
    const b = await communityAction({}, form("invite"));
    expect(a.inviteUrl).toMatch(
      /^https:\/\/gathering.example\/communities\/invites\/[a-f0-9]{64}$/,
    );
    expect(a.inviteUrl).not.toEqual(b.inviteUrl);
    const payload = mocks.rpc.mock.calls[0][1].p_data;
    expect(payload.token_digest).toMatch(/^[a-f0-9]{64}$/);
    expect(a.inviteUrl).not.toContain(payload.token_digest);
    expect(Object.keys(payload)).toEqual(["token_digest"]);
  });
  it("does not create invitations if the canonical origin is invalid", async () => {
    mocks.origin.mockImplementation(() => {
      throw Error("missing APP_URL");
    });
    expect((await communityAction({}, form("invite"))).error).toBeTruthy();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("validates channel names, order, and category ownership input types", async () => {
    for (const values of [
      { name: "Invalid Name" },
      { position: "-1" },
      { position: "1000" },
      { category_id: "forged" },
    ]) {
      expect(
        parseCommand(
          form("channel", {
            name: "general",
            description: "",
            kind: "text",
            position: "0",
            ...values,
          }),
        ),
      ).toBeNull();
    }
  });
  it("rejects missing and conflicting override targets", () => {
    for (const values of [{}, { user_id: communityId, role: "member" }])
      expect(
        parseCommand(form("override", { channel_id: communityId, ...values })),
      ).toBeNull();
  });
  it("rejects forged owner promotions and malformed invitation tokens", () => {
    expect(
      parseCommand(form("role", { user_id: communityId, role: "owner" })),
    ).toBeNull();
    expect(parseCommand(form("accept_invite", { token: "guess" }))).toBeNull();
  });
  it("maps the override reset control without shadowing native form reset", () => {
    const parsed = parseCommand(
      form("override", {
        channel_id: communityId,
        role: "member",
        reset_override: "on",
      }),
    );
    expect(parsed?.command.data).toMatchObject({ reset: true, role: "member" });
    expect(parsed?.command.data).not.toHaveProperty("reset_override");
  });
  it("returns an unavailable state after transport errors", async () => {
    mocks.rpc.mockRejectedValue(Error("private network detail"));
    const result = await communityAction({}, form("join"));
    expect(result.error).toContain("unavailable");
    expect(result.notice).toBeUndefined();
  });
});
