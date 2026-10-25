"use client";
import type { PendingMessage } from "../../lib/chat/types";
import { SafeMarkdown } from "./SafeMarkdown";
export function PendingMessageRow({ message }: { message: PendingMessage }) {
  return <article className={`chat-message pending-message ${message.status}`} data-pending-message-id={message.id} aria-label="Your pending message">
    <span className="pending-avatar" aria-hidden="true">You</span><div className="chat-message-content"><strong>You</strong><span className="pending-delivery" role="status">{message.status === "sending" ? "Sending…" : "Delivery unconfirmed"}</span>
      <SafeMarkdown text={message.body} />
      {!!message.attachments.length && <p className="muted">{message.attachments.map(file => file.filename).join(", ")}</p>}
      {message.status === "failed" && <p className="form-error">{message.error} <a href={`#composer-${message.parentId ? "thread" : "channel"}-${message.parentId ?? message.channelId}`}>Review send and retry</a></p>}
    </div>
  </article>;
}
