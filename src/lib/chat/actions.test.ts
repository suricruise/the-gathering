// @vitest-environment node
import { beforeEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({ require: vi.fn(), rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../auth/session", () => ({ requireUser: mocks.require }));
import {
  sendMessage,
  changeMessage,
  getHistory,
  reactToMessage,
  getMessage,
} from "./actions";
const id = "a4000000-0000-4000-8000-000000000001";
const input = {
  id,
  channelId: id,
  body: "Hello",
  parentId: null,
  replyToId: null,
  attachments: [],
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.require.mockResolvedValue({
    client: { rpc: mocks.rpc },
    user: { id: "verified-user" },
  });
});
describe("Chat server actions", () => {
  it("rejects caller-supplied identity or malformed IDs before issuing commands", async () => {
    expect(
      (await sendMessage({ ...input, author_id: "forged" })).error,
    ).toBeTruthy();
    expect(
      (await changeMessage({ id: "forged", operation: "delete" })).error,
    ).toBeTruthy();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("independently authenticates a valid send request", async () => {
    mocks.require.mockRejectedValue(Error("redirect"));
    await expect(sendMessage(input)).rejects.toThrow();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("persists using a stable message ID and returns only committed data", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: id, error: null })
      .mockResolvedValueOnce({ data: { id, body: "Hello" }, error: null });
    const result = await sendMessage(input);
    expect(result.data?.id).toBe(id);
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "send_channel_message", {
      p_id: id,
      p_channel: id,
      p_body: "Hello",
      p_parent: null,
      p_reply_to: null,
      p_attachments: [],
    });
  });
  it("reports permission denial and does not pretend a failed send succeeded", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "private internal detail" },
    });
    const result = await sendMessage(input);
    expect(result.denied).toBe(true);
    expect(result.data).toBeUndefined();
    expect(result.error).not.toContain("private internal detail");
  });
  it("keeps real rate limits distinct from transport failures", async () => {
    mocks.rpc.mockResolvedValueOnce({ error: { code: "P0001" } });
    expect((await sendMessage(input)).error).toContain("wait");
    mocks.rpc.mockRejectedValueOnce(Error("network"));
    expect((await sendMessage(input)).error).toContain("retry");
  });
  it("bounds history/search, reactions and individual-message input", async () => {
    expect(
      (await getHistory({ channelId: id, before: "-1" })).error,
    ).toBeTruthy();
    expect(
      (await reactToMessage({ id, emoji: "invalid", active: true })).error,
    ).toBeTruthy();
    expect((await getMessage("not-an-id")).error).toBeTruthy();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
