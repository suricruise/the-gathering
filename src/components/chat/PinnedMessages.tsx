"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { getPinnedMessages, setMessagePin } from "../../lib/chat/pins";
import type { ChatMessage } from "../../lib/chat/types";
import { SafeMarkdown } from "./SafeMarkdown";
export function PinnedMessages({ channel, revision, moderator, onMerge }: { channel: string; revision: number; moderator: boolean; onMerge: (messages: ChatMessage[]) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false), [retry, setRetry] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true); setError("");
    void getPinnedMessages(channel).then((result) => {
      if (!active) return;
      if (result.data) setMessages(result.data); else { setMessages([]); setError(result.error ?? "Pins unavailable."); }
    }).catch(() => { if (active) { setMessages([]); setError("Pins unavailable. Check your connection and retry."); } }).finally(() => { if(active) setLoading(false); });
    return () => { active = false; };
  }, [channel, revision, open, retry]);
  return <>
    <button className="chat-text-button" aria-haspopup="dialog" onClick={() => { setOpen(true); dialog.current?.showModal(); }}>Pinned messages</button>
    <dialog ref={dialog} className="message-pins-panel" aria-label="Pinned messages" onClose={() => { setOpen(false); setMessages([]); setError(""); }}>
      <header><h2>Pinned messages</h2><button type="button" className="chat-text-button" onClick={() => dialog.current?.close()}>Close pins</button></header>
      <p className="muted">Up to 50 messages, managed by this community’s moderators.</p>
      {loading && <p role="status">Loading pins…</p>}
      {error && <p role="alert">{error} <button type="button" className="chat-text-button" onClick={() => setRetry((value) => value + 1)}>Retry pins</button></p>}
      {!loading && !error && !messages.length && <p>No pinned messages yet.</p>}
      <ul>{messages.map((message) => <li key={message.id} data-pinned-id={message.id}>
        <strong>{message.author_name}</strong><SafeMarkdown text={message.body} />
        {!message.body && message.attachments.length > 0 && <p>{message.attachments.length} attachment(s)</p>}
        <Link href={`/channels/${channel}?message=${message.id}`} onClick={() => dialog.current?.close()}>Go to message</Link>
        {moderator && <button type="button" className="chat-text-button" disabled={busy} onClick={async () => {
          setBusy(true); setError("");
          try { const result = await setMessagePin({ id: message.id, active: false }); if(result.data) { onMerge([result.data]); setRetry((value) => value + 1); } else setError(result.error ?? "Unpin unavailable."); }
          catch { setError("Unpin unavailable. Please retry."); }
          finally { setBusy(false); }
        }}>Unpin message</button>}
      </li>)}</ul>
    </dialog>
  </>;
}
