import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ get: vi.fn(), pin: vi.fn() }));
vi.mock("../../lib/chat/pins", () => ({ getPinnedMessages: m.get, setMessagePin: m.pin }));
import { PinnedMessages } from "./PinnedMessages";
beforeEach(() => {
  vi.resetAllMocks();
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); fireEvent(this, new Event("close")); };
});
const props = { channel: "a4000000-0000-4000-8000-000000000001", revision: 0, moderator: false, onMerge: vi.fn() };
const row = { id: "a4000000-0000-4000-8000-000000000002", author_name: "Taylor", body: "Pinned **content**", attachments: [] };
it("loads only on opening, hides moderator actions and refreshes when committed changes arrive", async () => {
  m.get.mockResolvedValueOnce({ data: [row] }).mockResolvedValueOnce({ data: [] });
  const view = render(<PinnedMessages {...props} />);
  expect(m.get).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Pinned messages" }));
  await screen.findByRole("link", { name: "Go to message" });
  expect(screen.queryByRole("button", { name: "Unpin message" })).toBeNull();
  view.rerender(<PinnedMessages {...props} revision={1} />);
  await screen.findByText("No pinned messages yet.");
  fireEvent.click(screen.getByRole("button", { name: "Close pins" }));
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("surfaces real read and unpin failures without pretending success", async () => {
  m.get.mockRejectedValueOnce(Error("network")).mockResolvedValueOnce({ data: [row] });
  m.pin.mockResolvedValueOnce({ error: "Permissions changed" });
  render(<PinnedMessages {...props} moderator />);
  fireEvent.click(screen.getByRole("button", { name: "Pinned messages" }));
  await screen.findByRole("alert"); fireEvent.click(screen.getByRole("button", { name: "Retry pins" }));
  await screen.findByRole("link", { name: "Go to message" });
  fireEvent.click(screen.getByRole("button", { name: "Unpin message" }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Permissions changed"));
  expect(props.onMerge).not.toHaveBeenCalled();
});
