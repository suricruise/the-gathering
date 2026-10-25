import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ page: vi.fn() }));
vi.mock("../../lib/chat/threads", () => ({ getThreadPage: m.page }));
vi.mock("./MessageComposer", () => ({ MessageComposer: ({ parentId }: { parentId: string }) => <textarea aria-label="Thread test composer" data-parent={parentId} /> }));
vi.mock("./MessageItem", () => ({ MessageItem: ({ message }: { message: { body: string } }) => <p>{message.body}</p> }));
import { ThreadPanel } from "./ThreadPanel";
import type { ChatMessage } from "../../lib/chat/types";
const channelId = "a4000000-0000-4000-8000-000000000001", parentId = "a4000000-0000-4000-8000-000000000002";
const root = { id: parentId, channel_id: channelId, parent_id: null, body: "Original", reply_count: 0 } as ChatMessage;
const props = { channelId, channelName: "general", parentId, targetId: parentId, active: true, messages: [root], userId: "user", canPost: true, connection: "Live", moderator: false, localTime: false, locked: false, highlight: "", onClose: vi.fn(), onReply: vi.fn(), onMerge: vi.fn(), onDenied: vi.fn(), onTyping: vi.fn(), onLocked: vi.fn() };
beforeEach(() => { vi.resetAllMocks(); });
it("loads on demand and keeps main-system IDs and composer scope", async () => {
  m.page.mockResolvedValue({ data: { root, messages: [] } });
  const view = render(<ThreadPanel {...props} active={false} />); expect(m.page).not.toHaveBeenCalled();
  view.rerender(<ThreadPanel {...props} />); await screen.findByText("Start a focused conversation about this message.");
  expect(m.page).toHaveBeenCalledWith({ channelId, parentId }); expect(screen.getByLabelText("Thread test composer")).toHaveAttribute("data-parent", parentId);
  fireEvent.click(screen.getByRole("button", { name: "Back to channel" })); expect(props.onClose).toHaveBeenCalledOnce();
});
it("invalidates an in-flight page when a thread is closed or unmounted", async () => {
  let resolve!: (value: unknown) => void; m.page.mockImplementation(() => new Promise((done) => { resolve = done; }));
  const view = render(<ThreadPanel {...props} />); view.unmount();
  await act(async () => resolve({ data: { root, messages: [] } })); expect(props.onMerge).not.toHaveBeenCalled();
});
it("revocation clears access through the channel owner instead of displaying stale history", async () => {
  m.page.mockResolvedValue({ denied: true, error: "Access removed" }); render(<ThreadPanel {...props} />);
  await waitFor(() => expect(props.onDenied).toHaveBeenCalledOnce()); expect(props.onMerge).not.toHaveBeenCalled();
});
it("failed loads provide a retry rather than a fake empty success", async () => {
  m.page.mockRejectedValueOnce(Error("offline")).mockResolvedValueOnce({ data: { root, messages: [] } }); render(<ThreadPanel {...props} />);
  await screen.findByRole("alert"); fireEvent.click(screen.getByRole("button", { name: "Retry thread" }));
  await screen.findByText("Start a focused conversation about this message."); expect(m.page).toHaveBeenCalledTimes(2);
});
it("switching thread keys ignores the old response and loads only the new parent", async () => {
  let resolveOld!: (value: unknown) => void;
  const otherParent = "a4000000-0000-4000-8000-000000000003", otherRoot = { ...root, id: otherParent, body: "Other root" };
  m.page.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; })).mockResolvedValueOnce({ data: { root: otherRoot, messages: [] } });
  const view = render(<ThreadPanel key={parentId} {...props} />);
  view.rerender(<ThreadPanel key={otherParent} {...props} parentId={otherParent} targetId={otherParent} messages={[otherRoot]} />);
  await screen.findByText("Start a focused conversation about this message.");
  await act(async () => resolveOld({ data: { root, messages: [] } }));
  expect(props.onMerge).toHaveBeenCalledTimes(1); expect(props.onMerge).toHaveBeenCalledWith([otherRoot]);
});
