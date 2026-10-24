import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ send: vi.fn(), members: vi.fn(), upload: vi.fn() }));
vi.mock("../../lib/chat/actions", () => ({ sendMessage: mocks.send }));
vi.mock("../../lib/communities/members", () => ({ communityMembers: mocks.members }));
vi.mock("../../lib/chat/upload-client", () => ({ uploadChatFile: mocks.upload }));
import { MessageComposer } from "./MessageComposer";
import type { ChatMessage } from "../../lib/chat/types";
const channel = "a4000000-0000-4000-8000-000000000001";
function setup(extra = {}) {
  const props = { channelId: channel, channelName: "general", userId: "self", canPost: true, connection: "Live", parentId: null, hidden: false, onCancelReply: vi.fn(), onSent: vi.fn(), onTyping: vi.fn(), onLocked: vi.fn(), ...extra };
  render(<MessageComposer {...props} />);
  return { ...props, input: screen.getByRole("textbox", { name: props.parentId ? "Thread reply" : "Message general" }) };
}
beforeEach(() => {
  vi.resetAllMocks();
  HTMLElement.prototype.scrollIntoView = vi.fn();
  mocks.members.mockResolvedValue({ data: { items: [] } });
  mocks.send.mockResolvedValue({ data: { id: "committed" }, delivery: "sent" });
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); fireEvent(this, new Event("close")); };
});
describe("community composer", () => {
  it("sends on Enter, keeps Shift+Enter and composition out of submission, and guards repeated Enter", async () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: "hello\nworld", selectionStart: 11 } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    fireEvent.compositionStart(input); fireEvent.keyDown(input, { key: "Enter" });
    expect(mocks.send).not.toHaveBeenCalled();
    fireEvent.compositionEnd(input);
    fireEvent.keyDown(input, { key: "Enter" }); fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(screen.getByText("Message sent.")).toBeVisible());
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.send.mock.calls[0][0].body).toBe("hello\nworld");
  });
  it("freezes an unconfirmed payload and retries with the same UUID and body", async () => {
    mocks.send.mockRejectedValueOnce(Error("connection lost"));
    const { input } = setup();
    fireEvent.change(input, { target: { value: "one logical message" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await screen.findByRole("button", { name: "Retry message" });
    expect(input).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Retry message" }));
    await screen.findByText("Message sent.");
    expect(mocks.send.mock.calls[1][0]).toEqual(mocks.send.mock.calls[0][0]);
  });
  it("allows correcting a definite rejection, but never treats a denial after an uncertain send as proof of absence", async () => {
    mocks.send.mockResolvedValueOnce({ error: "Not allowed", delivery: "not_sent" });
    const { input } = setup(); fireEvent.change(input, { target: { value: "draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await screen.findByText("Not allowed"); expect(input).toBeEnabled();
    mocks.send.mockRejectedValueOnce(Error("lost"));
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await screen.findByRole("button", { name: "Retry message" });
    mocks.send.mockResolvedValueOnce({ error: "Access changed", delivery: "not_sent" });
    fireEvent.click(screen.getByRole("button", { name: "Retry message" }));
    await screen.findByText("Access changed"); expect(input).toBeDisabled();
  });
  it("inserts emoji at the caret without submitting", async () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: "good game" } });
    (input as HTMLTextAreaElement).setSelectionRange(4, 4); fireEvent.select(input);
    fireEvent.click(screen.getByRole("button", { name: "Choose emoji" }));
    fireEvent.click(screen.getByRole("button", { name: "gaming controller" }));
    expect(input).toHaveValue("good🎮 game"); expect(mocks.send).not.toHaveBeenCalled();
  });
  it("looks up only authorized channel members and supports keyboard mention selection", async () => {
    mocks.members.mockResolvedValue({ data: { items: [{ id: "member", username: "taylor", name: "Taylor" }] } });
    const { input } = setup();
    fireEvent.change(input, { target: { value: "Hi @tay", selectionStart: 7 } });
    await screen.findByRole("option", { name: "Taylor @taylor" });
    expect(mocks.members).toHaveBeenCalledWith({ channel, query: "tay", size: 8 });
    fireEvent.keyDown(input, { key: "ArrowDown" }); fireEvent.keyDown(input, { key: "Tab" });
    expect(input).toHaveValue("Hi @taylor "); expect(mocks.send).not.toHaveBeenCalled();
  });
  it("shows and cancels a reply without losing the draft", () => {
    const cancel = vi.fn(); setup({ parentId: channel, reply: { id: channel, author_name: "Taylor", body: "A question" } as ChatMessage, onCancelReply: cancel });
    fireEvent.change(screen.getByRole("textbox", { name: "Thread reply" }), { target: { value: "my reply" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel reply" }));
    expect(cancel).toHaveBeenCalledOnce(); expect(screen.getByRole("textbox", { name: "Thread reply" })).toHaveValue("my reply");
  });
  it("rejects invalid attachments, shows actual upload progress/failure and allows retry before send", async () => {
    let reject!: (error: Error) => void;
    mocks.upload.mockImplementation((_channel, _file, progress) => {
      progress(42); return { abort: vi.fn(), result: new Promise((_resolve, fail) => { reject = fail; }) };
    });
    setup();
    fireEvent.change(screen.getByLabelText("Attach files"), { target: { files: [new File(["x"], "unsafe.html", { type: "text/html" })] } });
    expect(mocks.upload).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Attach files"), { target: { files: [new File(["hello"], "notes.txt", { type: "text/plain" })] } });
    expect(screen.getByText("Uploading 42%")).toBeVisible();
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
    await act(async () => reject(Error("Network interrupted")));
    expect(screen.getByText("Network interrupted")).toBeVisible();
    mocks.upload.mockReturnValueOnce({ abort: vi.fn(), result: Promise.resolve({ id: channel, filename: "notes.txt", kind: "file", mime: "text/plain", byte_size: 5 }) });
    fireEvent.click(screen.getByRole("button", { name: "Retry upload" }));
    await screen.findByText("Ready to send");
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ attachments: [channel] })));
  });
  it("disables posting and uploads when channel access cannot post", () => {
    const { input } = setup({ canPost: false });
    expect(input).toBeDisabled(); expect(screen.getByLabelText("Attach files")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
  });
});
it("ignores stale member suggestions after the query changes", async () => {
  let resolveOld!: (value: unknown) => void;
  mocks.members.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
  const { input } = setup();
  fireEvent.change(input, { target: { value: "@old", selectionStart: 4 } });
  await waitFor(() => expect(mocks.members).toHaveBeenCalledOnce());
  mocks.members.mockResolvedValueOnce({ data: { items: [{ id: "new", username: "new_user", name: "Current Member" }] } });
  fireEvent.change(input, { target: { value: "@new", selectionStart: 4 } });
  await screen.findByRole("option", { name: "Current Member @new_user" });
  await act(async () => resolveOld({ data: { items: [{ id: "old", username: "old_user", name: "Stale Member" }] } }));
  expect(screen.queryByRole("option", { name: "Stale Member @old_user" })).toBeNull();
  fireEvent.keyDown(input, { key: "Escape" });
  expect(screen.queryByRole("listbox")).toBeNull();
});
it("aborts pending private uploads when the composer unmounts", async () => {
  const abort = vi.fn();
  mocks.upload.mockReturnValue({ abort, result: new Promise(() => {}) });
  const props = { channelId: channel, channelName: "general", userId: "self", canPost: true, connection: "Live", parentId: null, hidden: false, onCancelReply: vi.fn(), onSent: vi.fn(), onTyping: vi.fn(), onLocked: vi.fn() };
  const view = render(<MessageComposer {...props} />);
  fireEvent.change(screen.getByLabelText("Attach files"), { target: { files: [new File(["x"], "note.txt", { type: "text/plain" })] } });
  view.unmount(); expect(abort).toHaveBeenCalledOnce();
});
