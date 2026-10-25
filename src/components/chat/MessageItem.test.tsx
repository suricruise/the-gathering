import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ change: vi.fn(), react: vi.fn(), pin: vi.fn() }));
vi.mock("../../lib/chat/actions", () => ({ changeMessage: m.change, reactToMessage: m.react }));
vi.mock("../../lib/chat/pins", () => ({ setMessagePin: m.pin }));
vi.mock("../../lib/chat/preview-action", () => ({ loadLinkPreviews: vi.fn() }));
import { MessageItem } from "./MessageItem";
import type { ChatMessage } from "../../lib/chat/types";
const message: ChatMessage = { id: "a4000000-0000-4000-8000-000000000001", channel_id: "a4000000-0000-4000-8000-000000000002", author_id: "author", author_name: "Taylor", author_avatar: false, parent_id: null, reply_to_id: null, body: "Original **text**", created_at: "2026-10-24T00:00:00Z", edited_at: null, deleted_at: null, version: "1", created_seq: "1", reply_count: 0, read_count: 0, attachments: [], reactions: [], previews: [] };
function setup(extra = {}) { const props = { message, userId: "other", moderator: false, canPost: true, onMerge: vi.fn(), onReply: vi.fn(), ...extra }; render(<MessageItem {...props} />); fireEvent.click(screen.getByLabelText("Message actions")); return props; }
beforeEach(() => { vi.resetAllMocks(); });
it("ordinary members see reply/copy/report but no foreign edit/delete or moderator pin controls", () => {
  setup(); expect(screen.getByRole("button", { name: "Reply" })).toBeVisible(); expect(screen.getAllByRole("button", { name: "Start thread" }).at(-1)).toBeVisible();
  expect(screen.getByRole("link", { name: "Report message" })).toHaveAttribute("href", `/reports?type=message&target=${message.id}`);
  expect(screen.queryByRole("button", { name: "Edit" })).toBeNull(); expect(screen.queryByText("Delete message")).toBeNull(); expect(screen.queryByRole("button", { name: "Pin message" })).toBeNull();
});
it("copies text and stable deep links with real success/failure feedback", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined); Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  setup(); fireEvent.click(screen.getByRole("button", { name: "Copy text" })); await screen.findByText("Message text copied."); expect(writeText).toHaveBeenLastCalledWith(message.body);
  fireEvent.click(screen.getByRole("button", { name: "Copy link" })); await screen.findByText("Message link copied."); expect(writeText).toHaveBeenLastCalledWith(`${location.origin}/channels/${message.channel_id}?message=${message.id}`);
  writeText.mockRejectedValueOnce(Error()); fireEvent.click(screen.getByRole("button", { name: "Copy text" })); await screen.findByRole("alert");
});
it("edits inline, cancels without a mutation and handles a rejected save", async () => {
  setup({ userId: "author" }); fireEvent.click(screen.getByRole("button", { name: "Edit" })); fireEvent.change(screen.getByRole("textbox", { name: "Edit message" }), { target: { value: "Changed" } });
  fireEvent.click(screen.getByRole("button", { name: "Cancel edit" })); expect(m.change).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Edit" })); expect(screen.getByRole("textbox", { name: "Edit message" })).toHaveValue(message.body);
  m.change.mockResolvedValueOnce({ error: "Permission changed" }); fireEvent.click(screen.getByRole("button", { name: "Save edit" })); await screen.findByText("Permission changed"); expect(screen.getByRole("textbox", { name: "Edit message" })).toBeVisible();
});
it("toggles its own reaction and never double-submits a pending action", async () => {
  m.react.mockResolvedValue({ data: message }); setup({ message: { ...message, reactions: [{ emoji: "👍", mine: true, count: 2 }] } });
  fireEvent.click(screen.getByRole("button", { name: "👍 reaction, 2, selected" })); fireEvent.click(screen.getByRole("button", { name: "👍 reaction, 2, selected" }));
  await waitFor(() => expect(m.react).toHaveBeenCalledTimes(1)); expect(m.react).toHaveBeenCalledWith({ id: message.id, emoji: "👍", active: false });
});
it("requires a moderator deletion confirmation and submits pin changes to the server", async () => {
  m.pin.mockResolvedValue({ data: { ...message, pinned_at: "now" } }); setup({ moderator: true });
  fireEvent.click(screen.getByText("Delete message")); expect(m.change).not.toHaveBeenCalled(); expect(screen.getByRole("textbox", { name: "Moderation reason" })).toBeRequired();
  fireEvent.click(screen.getByRole("button", { name: "Cancel deletion" })); expect(m.change).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Pin message" })); await screen.findByText("Message pinned."); expect(m.pin).toHaveBeenCalledWith({ id: message.id, active: true });
});
it("keeps a deleted root's replies reachable while removing unsafe actions/content", () => {
  const props = setupDeleted(); fireEvent.click(screen.getByRole("button", { name: "View thread · 2" })); expect(props.onReply).toHaveBeenCalled(); expect(screen.queryByText("Original text")).toBeNull(); expect(screen.queryByLabelText("Message actions")).toBeNull();
});
function setupDeleted() { const props = { message: { ...message, deleted_at: "now", body: "", reply_count: 2 }, userId: "other", moderator: false, canPost: true, onMerge: vi.fn(), onReply: vi.fn() }; render(<MessageItem {...props} />); return props; }
