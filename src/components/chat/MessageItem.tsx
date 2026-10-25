"use client";
import Link from "next/link";
import { MoreHorizontal, SmilePlus, Reply, MessagesSquare, Copy, Pin } from "lucide-react";
import { useRef, useState } from "react";
import { ProfileAvatar } from "../ui";
import { changeMessage, reactToMessage } from "../../lib/chat/actions";
import { setMessagePin } from "../../lib/chat/pins";
import { loadLinkPreviews } from "../../lib/chat/preview-action";
import { messageLinks } from "../../lib/chat/validation";
import { reactionEmoji, type ChatMessage } from "../../lib/chat/types";
import { messageTime, messageDateLabel } from "../../lib/chat/presentation";
import { SafeMarkdown } from "./SafeMarkdown";
export function MessageItem({
  message: m,
  userId,
  moderator,
  canPost,
  replyDisabled = false,
  onMerge,
  onReply,
  highlight = false,
  grouped = false,
  localTime = false,
  scope = "channel",
}: {
  message: ChatMessage;
  userId: string;
  moderator: boolean;
  canPost: boolean;
  replyDisabled?: boolean;
  onMerge: (messages: ChatMessage[]) => void;
  onReply: (m: ChatMessage) => void;
  highlight?: boolean;
  grouped?: boolean;
  localTime?: boolean;
  scope?: "channel" | "thread";
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  const reactionMenu = useRef<HTMLDetailsElement>(null);
  const editInput = useRef<HTMLTextAreaElement>(null);
  const mutation = useRef(false);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(m.body);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const mutate = async (operation: "edit" | "delete", reason = "") => {
    if (mutation.current) return;
    mutation.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await changeMessage({
        id: m.id,
        operation,
        body: text,
        reason,
      });
      if (result.data) {
        onMerge([result.data]);
        setEditing(false);
      } else setError(result.error ?? "Change unavailable.");
    } catch {
      setError("The change did not finish. Please retry.");
    } finally {
      mutation.current = false;
      setBusy(false);
    }
  };
  const react = async (emoji: string, active: boolean) => {
    if (mutation.current) return;
    mutation.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await reactToMessage({ id: m.id, emoji, active });
      if (result.data) onMerge([result.data]);
      else setError(result.error ?? "Reaction unavailable.");
    } catch {
      setError("Reaction unavailable. Please retry.");
    } finally {
      mutation.current = false;
      setBusy(false);
    }
  };
  const preview = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await loadLinkPreviews(m.id);
      if (result.data) onMerge([result.data]);
      else setError(result.error ?? "Preview unavailable.");
    } catch {
      setError("Preview unavailable.");
    } finally {
      setBusy(false);
    }
  };
  const copy = async (link: boolean) => {
    setError(""); setNotice("");
    try {
      if (!navigator.clipboard) throw Error();
      await navigator.clipboard.writeText(link ? `${location.origin}/channels/${m.channel_id}?message=${m.id}` : m.body);
      setNotice(link ? "Message link copied." : "Message text copied.");
    } catch { setError("Copy unavailable in this browser."); }
  };
  const pin = async () => {
    if (mutation.current) return;
    mutation.current = true; setBusy(true); setError("");
    try { const result = await setMessagePin({ id: m.id, active: !m.pinned_at });
      if (result.data) { onMerge([result.data]); setNotice(result.data.pinned_at ? "Message pinned." : "Message unpinned."); }
      else setError(result.error ?? "Pin unavailable.");
    } catch { setError("Pin unavailable. Please retry."); }
    finally { mutation.current = false; setBusy(false); }
  };
  function beginEdit() {
    setText(m.body); setEditing(true); setError("");
    requestAnimationFrame(() => editInput.current?.focus());
  }
  return (
    <article
      id={`${scope === "thread" ? "thread-message" : "message"}-${m.id}`}
      data-message-id={scope === "channel" ? m.id : undefined}
      data-thread-message-id={scope === "thread" ? m.id : undefined}
      className={`chat-message ${highlight ? "highlighted" : ""} ${grouped ? "is-grouped" : ""}`}
      aria-label={`Message from ${m.author_name}`}
    >
      <div className="chat-message-avatar">
        {grouped ? <time className="chat-group-time" dateTime={m.created_at} title={`${messageDateLabel(m.created_at, localTime)}, ${messageTime(m.created_at, localTime)}`}>{messageTime(m.created_at, localTime)}</time> : m.author_avatar && m.author_id ? (
          <img
            src={`/api/avatars/${m.author_id}`}
            alt={m.author_name}
            width={36}
            height={36}
          />
        ) : (
          <ProfileAvatar name={m.author_name} />
        )}
      </div>
      <div className="chat-message-content">
        {!grouped && <header>
          <strong>{m.author_id ? <Link href={`/members/${m.author_id}`}>{m.author_name}</Link> : m.author_name}</strong>
          <time dateTime={m.created_at} title={m.created_at}>
            {messageTime(m.created_at, localTime)}
          </time>
          {m.edited_at && !m.deleted_at && <small>edited</small>}
        </header>}
        {grouped && m.edited_at && !m.deleted_at && <small>edited</small>}
        {m.pinned_at && !m.deleted_at && <small className="message-pin-label"><Pin size={12} aria-hidden="true" /> Pinned</small>}
        {scope === "channel" && !m.deleted_at && m.reply_count > 0 && <button type="button" className="message-thread-summary chat-text-button" disabled={replyDisabled} onClick={() => onReply(m)}>{m.reply_count} replies{m.thread_latest_at && <span> · Latest <time dateTime={m.thread_latest_at}>{messageTime(m.thread_latest_at, localTime)}</time></span>}</button>}
        {m.reply_to_id && <small className="muted">Reply in thread</small>}
        {m.deleted_at ? (
          <div><p className="muted">Message deleted</p>{m.reply_count > 0 && <button type="button" className="chat-text-button" disabled={replyDisabled} onClick={() => onReply(m)}>View thread · {m.reply_count}</button>}</div>
        ) : (
          <>
            {editing ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void mutate("edit");
                }}
              >
                <label className="field">
                  Edit message
                  <textarea
                    ref={editInput}
                    disabled={busy}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    maxLength={4000}
                    required
                  />
                </label>
                <div className="chat-actions">
                  <button className="button primary" disabled={busy}>
                    Save edit
                  </button>
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busy}
                    onClick={() => { setEditing(false); menu.current?.querySelector("summary")?.focus(); }}
                  >
                    Cancel edit
                  </button>
                </div>
              </form>
            ) : (
              <SafeMarkdown text={m.body} />
            )}
            {m.attachments.length > 0 && (
              <ul className="chat-attachments">
                {m.attachments.map((a) => (
                  <li key={a.id}>
                    {a.kind === "photo" || a.kind === "gif" ? (
                      <a
                        href={`/api/chat/attachments/${a.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <img
                          src={`/api/chat/attachments/${a.id}`}
                          alt={a.filename}
                          loading="lazy"
                        />
                        <span>
                          {a.kind === "gif" ? "GIF · " : ""}
                          {a.filename}
                        </span>
                      </a>
                    ) : (
                      <a href={`/api/chat/attachments/${a.id}`} download>
                        {a.filename} · {Math.ceil(a.byte_size / 1024)} KB
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {m.previews.map((p) => (
              <a
                className="chat-link-preview"
                key={p.url}
                href={p.url}
                target="_blank"
                rel="noopener noreferrer nofollow ugc"
              >
                <small>{p.hostname}</small>
                <strong>{p.title}</strong>
                <span>{p.description}</span>
              </a>
            ))}
            <div className="chat-reactions">
              {m.reactions.map((r) => (
                <button
                  key={r.emoji}
                  type="button"
                  disabled={busy || !canPost}
                  aria-pressed={r.mine}
                  aria-label={`${r.emoji} reaction, ${r.count}${r.mine ? ", selected" : ""}`}
                  onClick={() => void react(r.emoji, !r.mine)}
                >
                  {r.emoji} {r.count}
                </button>
              ))}
            </div>
            <div className="message-hover-toolbar" role="group" aria-label="Quick message actions">
              <button type="button" aria-label="Add emoji reaction" title="Add reaction" disabled={!canPost || busy} onClick={() => { if(menu.current) menu.current.open = true; if(reactionMenu.current) reactionMenu.current.open = true; requestAnimationFrame(() => reactionMenu.current?.querySelector("button")?.focus()); }}><SmilePlus size={17} /></button>
              <button type="button" aria-label="Reply to message" title="Reply in Thread" disabled={replyDisabled} onClick={() => onReply(m)}><Reply size={17} /></button>
              <button type="button" aria-label="Start thread" title="Start thread" disabled={replyDisabled} onClick={() => onReply(m)}><MessagesSquare size={17} /></button>
              <button type="button" aria-label="Copy message text" title="Copy text" onClick={() => void copy(false)}><Copy size={17} /></button>
            </div>
            <details ref={menu} className="chat-message-menu" onKeyDown={(event) => { if(event.key === "Escape" && menu.current) { menu.current.open=false; menu.current.querySelector("summary")?.focus(); } }}><summary aria-label="Message actions"><MoreHorizontal size={19} aria-hidden="true" /></summary>
            <div className="chat-actions">
              <button
                type="button"
                className="chat-text-button"
                disabled={replyDisabled} onClick={() => onReply(m)}
              >
                {m.parent_id
                  ? "Reply"
                  : `Reply${m.reply_count ? ` · ${m.reply_count}` : ""}`}
              </button>
              <button type="button" className="chat-text-button" disabled={replyDisabled} onClick={() => onReply(m)}>Reply in Thread</button>
              {canPost && (
                <details className="reaction-picker" ref={reactionMenu}>
                  <summary>Add reaction</summary>
                  <div>
                    {reactionEmoji.map((emoji) => (
                      <button
                        type="button"
                        key={emoji}
                        aria-label={`React ${emoji}`}
                        disabled={busy}
                        onClick={() =>
                          void react(
                            emoji,
                            !m.reactions.some(
                              (r) => r.emoji === emoji && r.mine,
                            ),
                          )
                        }
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </details>
              )}
              {m.author_id === userId && canPost && !editing && (
                <button
                  type="button"
                  className="chat-text-button"
                  onClick={beginEdit}
                >
                  Edit
                </button>
              )}
              {(m.author_id === userId || moderator) && (
                <details>
                  <summary>Delete message</summary>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const form = new FormData(e.currentTarget);
                      void mutate("delete", String(form.get("reason") ?? ""));
                    }}
                  >
                    {m.author_id !== userId && (
                      <label className="field">
                        Moderation reason
                        <input name="reason" maxLength={300} required />
                      </label>
                    )}
                    <p>This removes the message content for everyone.</p>
                    <button className="button secondary" disabled={busy}>
                      Confirm delete
                    </button>
                    <button type="button" className="chat-text-button" disabled={busy} onClick={(event) => { const details = event.currentTarget.closest("details"); if(details) { details.open = false; details.querySelector("summary")?.focus(); } }}>Cancel deletion</button>
                  </form>
                </details>
              )}
              <button
                type="button"
                className="chat-text-button"
                onClick={() => void copy(true)}
              >
                Copy link
              </button>
              <button type="button" className="chat-text-button" onClick={() => void copy(false)}>Copy text</button>
              <button type="button" className="chat-text-button" disabled={replyDisabled} onClick={() => onReply(m)}>{m.reply_count ? "View thread" : "Start thread"}</button>
              {moderator && <button type="button" className="chat-text-button" disabled={busy} onClick={() => void pin()}>{m.pinned_at ? "Unpin message" : "Pin message"}</button>}
              <Link href={`/reports?type=message&target=${m.id}`} className="chat-text-button">Report message</Link>
              {messageLinks(m.body).length > m.previews.length && (
                <button
                  type="button"
                  className="chat-text-button"
                  disabled={busy}
                  onClick={() => void preview()}
                >
                  Load link preview
                </button>
              )}
            </div></details>
            <small className="chat-read-count">Read by {m.read_count}</small>
          </>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        {notice && <p role="status">{notice}</p>}
      </div>
    </article>
  );
}
