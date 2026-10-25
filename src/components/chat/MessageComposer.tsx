"use client";
import { useEffect, useId, useRef, useState } from "react";
import { ImagePlus, Paperclip, Smile, X } from "lucide-react";
import { sendMessage } from "../../lib/chat/actions";
import { communityMembers, type DirectoryMember } from "../../lib/communities/members";
import { useChatIdentity } from "./ChatIdentity";
import { attachmentAccept, attachmentError, composerEmoji, mentionAt } from "../../lib/chat/composer";
import { uploadChatFile } from "../../lib/chat/upload-client";
import type { Attachment, ChatMessage, DeliveryChange } from "../../lib/chat/types";

type Staged = { id: string; file: File; state: "queued" | "uploading" | "ready" | "error"; percent: number; attachment?: Attachment; error?: string };
type Attempt = { id: string; channelId: string; body: string; parentId: string | null; replyToId: string | null; attachments: string[] };
export function MessageComposer({ channelId, channelName, userId, canPost, connection, parentId, reply, hidden, onCancelReply, onSent, onTyping, onLocked, committed, onDelivery }: {
  channelId: string; channelName: string; userId: string; canPost: boolean; connection: string;
  parentId: string | null; reply?: ChatMessage; hidden: boolean;
  committed?: ChatMessage[]; onDelivery?: (change: DeliveryChange) => void;
  onCancelReply: () => void; onSent: (message: ChatMessage) => void; onTyping: (active: boolean) => void; onLocked: (locked: boolean) => void;
}) {
  const identity=useChatIdentity();
  const [draft, setDraft] = useState("");
  const [staged, setStaged] = useState<Staged[]>([]);
  const entries = useRef<Staged[]>([]);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const uncertain = useRef(false);
  const failedId = useRef<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dragging, setDragging] = useState(false);
  const [caret, setCaret] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [suggestions, setSuggestions] = useState<DirectoryMember[]>([]);
  const [mentionLoading, setMentionLoading] = useState(false);
  const [mentionError, setMentionError] = useState("");
  const [selected, setSelected] = useState(0);
  const [emojiSearch, setEmojiSearch] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const emojiDialog = useRef<HTMLDialogElement>(null);
  const selection = useRef({ start: 0, end: 0 });
  const composing = useRef(false);
  const alive = useRef(true);
  const uploads = useRef(new Map<string, () => void>());
  const typingStop = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const listId = useId();
  const locked = sending || !!attempt;
  const disabled = !canPost || locked;
  const mention = !disabled && !dismissed ? mentionAt(draft, caret) : null;
  const query = mention?.query;
  const mass=identity?.canMassMention&&mention?['everyone','role:member','role:moderator','role:administrator','role:owner'].filter(token=>token.startsWith(mention.query.toLowerCase())):[];
  const suggestionCount=suggestions.length+mass.length;
  const update = (next: Staged[]) => { entries.current = next; setStaged(next); };
  useEffect(() => {
    alive.current = true;
    const activeUploads = uploads.current;
    return () => { alive.current = false; clearTimeout(typingStop.current); for (const abort of activeUploads.values()) abort(); activeUploads.clear(); };
  }, []);
  useEffect(() => { onLocked(locked); }, [locked, onLocked]);
  useEffect(() => {
    const input = textarea.current;
    if (input) { input.style.height = "auto"; input.style.height = `${Math.min(input.scrollHeight, 160)}px`; }
  }, [draft, hidden]);
  useEffect(() => {
    let active = true;
    setSuggestions([]); setSelected(0); setMentionError("");
    if (query === undefined || hidden) { setMentionLoading(false); return; }
    setMentionLoading(true);
    const timer = setTimeout(() => {
      void communityMembers({ channel: channelId, query:query.includes(":")?"":query, size: 8 }).then((result) => {
        if (!active) return;
        setSuggestions(query.includes(":")?[]:result.data?.items.filter((m) => m.id !== userId) ?? []);
        setMentionError(result.error ?? "");
        setMentionLoading(false);
      }).catch(() => { if (active) { setMentionError("Member suggestions unavailable. Type a username or retry."); setMentionLoading(false); } });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [query, channelId, userId, hidden]);
  useEffect(() => {
    if (query !== undefined) document.getElementById(`${listId}-${selected}`)?.scrollIntoView({ block: "nearest" });
  }, [selected, suggestions, listId, query]);
  // Stop uploads on access loss; server authorization remains authoritative.
  useEffect(() => {
    if (!canPost) { for (const abort of uploads.current.values()) abort(); }
  }, [canPost]);
  useEffect(() => {
    if (!attempt || sending) return;
    const saved = committed?.find(message => message.id === attempt.id && message.channel_id === channelId && message.author_id === userId && message.parent_id === attempt.parentId);
    if (!saved) return;
    onDelivery?.({ type: "settled", id: attempt.id }); onSent(saved);
    setDraft(""); update([]); setAttempt(null); uncertain.current = false; failedId.current = null;
    setError(""); setNotice(saved.deleted_at ? "Message was saved and later removed." : "Message sent.");
    // These callbacks may change identity, but an acknowledgement clears the attempt atomically.
  }, [attempt, sending, committed, channelId, userId, onDelivery, onSent]);
  function changeDraft(value: string, position: number) {
    if (failedId.current && !locked) { onDelivery?.({ type: "discard", id: failedId.current }); failedId.current = null; }
    setDraft(value); setCaret(position); setDismissed(false); setNotice(""); setError("");
    onTyping(!!value.trim()); clearTimeout(typingStop.current);
    typingStop.current = setTimeout(() => onTyping(false), 4000);
  }
  function insert(text: string, start: number, end: number) {
    const next = draft.slice(0, start) + text + draft.slice(end);
    if (next.length > 4000) { setError("Messages can contain up to 4000 characters."); return; }
    changeDraft(next, start + text.length);
    requestAnimationFrame(() => { textarea.current?.focus(); textarea.current?.setSelectionRange(start + text.length, start + text.length); });
  }
  function selectMention(member: DirectoryMember) {
    if (!mention) return;
    insert(`@${member.username} `, mention.start, mention.end); setDismissed(true);
  }
  async function startUpload(entry: Staged) {
    if (!canPost || locked || uploads.current.has(entry.id)) return;
    update(entries.current.map((item) => item.id === entry.id ? { ...item, state: "uploading", percent: 0, error: undefined } : item));
    const upload = uploadChatFile(channelId, entry.file, (percent) => {
      if (alive.current) update(entries.current.map((item) => item.id === entry.id ? { ...item, percent } : item));
    });
    uploads.current.set(entry.id, upload.abort);
    try {
      const attachment = await upload.result;
      if (alive.current) update(entries.current.map((item) => item.id === entry.id ? { ...item, state: "ready", percent: 100, attachment } : item));
    } catch (failure) {
      if (alive.current) update(entries.current.map((item) => item.id === entry.id ? { ...item, state: "error", error: failure instanceof Error ? failure.message : "Upload failed. Please retry." } : item));
    } finally { uploads.current.delete(entry.id); }
  }
  function addFiles(list: FileList | File[]) {
    if (disabled) return;
    const files = Array.from(list);
    if (entries.current.length + files.length > 4) { setError("Attach up to four files per message."); return; }
    // Some OS file pickers omit MIME for text documents. Server still inspects bytes.
    const normalized = files.map((file) => {
      const types: Record<string, string> = { txt: "text/plain", md: "text/markdown", csv: "text/csv" };
      const type = types[file.name.split(".").at(-1)?.toLowerCase() ?? ""];
      return !file.type && type ? new File([file], file.name, { type }) : file;
    });
    const invalid = normalized.map(attachmentError).find(Boolean);
    if (invalid) { setError(invalid); return; }
    const next = normalized.map((file): Staged => ({ id: crypto.randomUUID(), file, state: "queued", percent: 0 }));
    update([...entries.current, ...next]); setError(""); setNotice("");
    // Four is the hard bounded maximum; each upload is independently authorized/rate limited.
    for (const entry of next) void startUpload(entry);
  }
  async function submit() {
    if (sendingRef.current || !canPost || entries.current.some((item) => item.state !== "ready") || (!attempt && !draft.trim() && !entries.current.length)) return;
    const payload = attempt ?? { id: crypto.randomUUID(), channelId, body: draft, parentId, replyToId: parentId ? reply?.id ?? parentId : null, attachments: entries.current.map((item) => item.attachment!.id) };
    if (failedId.current && failedId.current !== payload.id) onDelivery?.({ type: "discard", id: failedId.current });
    failedId.current = null;
    onDelivery?.({ type: "start", message: { id: payload.id, channelId, parentId: payload.parentId, replyToId: payload.replyToId, body: payload.body, attachments: entries.current.map(item => item.attachment!), status: "sending" } });
    sendingRef.current = true; setSending(true); setAttempt(payload); setError(""); setNotice(""); onTyping(false); clearTimeout(typingStop.current);
    try {
      const result = await sendMessage(payload);
      if (!alive.current) return;
      if (result.data) {
        onDelivery?.({ type: "settled", id: payload.id });
        onSent(result.data); setDraft(""); setCaret(0); selection.current = { start: 0, end: 0 }; update([]); setAttempt(null); uncertain.current = false; setNotice("Message sent.");
      } else {
        failedId.current = payload.id;
        onDelivery?.({ type: "failed", id: payload.id, error: result.error ?? "Delivery was not confirmed." });
        if (result.delivery === "not_sent" && !uncertain.current) setAttempt(null);
        else uncertain.current = true;
        setError(result.error ?? "Message delivery was not confirmed. Retry safely with the same ID.");
      }
    } catch {
      if (alive.current) { failedId.current = payload.id; onDelivery?.({ type: "failed", id: payload.id, error: "Delivery was not confirmed. Retry below." }); uncertain.current = true; setError("Message delivery was not confirmed. Retry uses the same ID to prevent duplicates."); }
    } finally { sendingRef.current = false; if (alive.current) setSending(false); }
  }
  return <form id={`composer-${parentId ? "thread" : "channel"}-${parentId ?? channelId}`} className={`chat-composer message-composer${dragging ? " is-dragging" : ""}`} hidden={hidden} onSubmit={(event) => { event.preventDefault(); void submit(); }}
    onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); if (!disabled) setDragging(true); } }}
    onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
    onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files); }}>
    {parentId && <div className="composer-reply"><span><strong>Replying to {reply?.author_name ?? "thread"}</strong><span>{reply?.deleted_at ? "Message deleted" : reply?.body.slice(0, 120)}</span></span><button type="button" className="composer-icon" aria-label="Cancel reply" disabled={locked} onClick={() => { onCancelReply(); requestAnimationFrame(() => textarea.current?.focus()); }}><X size={18} /></button></div>}
    {staged.length > 0 && <ul className="chat-staged-files composer-files">{staged.map((entry) => <li key={entry.id}>
      {entry.attachment?.kind !== "file" && entry.attachment && <img src={`/api/chat/attachments/${entry.attachment.id}`} alt={`Preview of ${entry.attachment.filename}`} width={80} height={64} />}
      <span className="composer-file-name">{entry.attachment?.filename ?? entry.file.name}</span>
      {entry.state === "uploading" && <span role="status"><progress max={100} value={entry.percent} aria-label={`Uploading ${entry.file.name}`} />{entry.percent === 100 ? "Processing…" : `Uploading ${entry.percent}%`}</span>}
      {entry.state === "ready" && <span className="muted">Ready to send</span>}
      {entry.state === "error" && <><span role="alert">{entry.error}</span><button type="button" className="chat-text-button" disabled={disabled} onClick={() => void startUpload(entry)}>Retry upload</button></>}
      <button type="button" className="chat-text-button" disabled={locked} onClick={() => { uploads.current.get(entry.id)?.(); uploads.current.delete(entry.id); update(entries.current.filter((item) => item.id !== entry.id)); }}>Remove attachment</button>
    </li>)}</ul>}
    <div className="composer-input-wrap">
      {mention && <div className="composer-mentions"><span className="sr-only" role="status">{mentionLoading ? "Finding members…" : mentionError || `${suggestionCount} mention suggestions`}</span>
        <ul id={listId} role="listbox" aria-label="Mention members">{suggestions.map((member, index) => <li key={member.id} id={`${listId}-${index}`} role="option" aria-selected={selected === index} onMouseDown={(event) => event.preventDefault()} onClick={() => selectMention(member)}><span>{member.name}</span><span className="muted">@{member.username}</span></li>)}{mass.map((token,index)=><li key={token} id={`${listId}-${suggestions.length+index}`} role="option" aria-selected={selected===suggestions.length+index} onMouseDown={event=>event.preventDefault()} onClick={()=>{if(mention){insert(`@${token} `,mention.start,mention.end);setDismissed(true);}}}><span>@{token}</span><span className="muted">Administrator mention · cooldown applies</span></li>)}</ul>
        {!suggestionCount && <p>{mentionLoading ? "Finding members…" : mentionError || "No matching members"}</p>}
      </div>}
      <label><span className="sr-only">{parentId ? "Thread reply" : `Message ${channelName}`}</span>
        <textarea ref={textarea} value={draft} rows={1} disabled={disabled} maxLength={4000} aria-describedby={`${listId}-help`} aria-autocomplete="list" aria-controls={mention ? listId : undefined} aria-activedescendant={mention && selected<suggestionCount ? `${listId}-${selected}` : undefined}
          placeholder={canPost ? `Message #${channelName}` : ["Connecting", "Reconnecting"].includes(connection) ? "Connecting to channel…" : "This channel is read-only"}
          onChange={(event) => changeDraft(event.target.value, event.target.selectionStart)}
          onSelect={(event) => { setCaret(event.currentTarget.selectionStart); selection.current = { start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd }; }}
          onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
          onKeyDown={(event) => {
            if (composing.current || event.nativeEvent.isComposing || event.keyCode === 229) return;
            if (mention && event.key === "Escape") { event.preventDefault(); setDismissed(true); return; }
            if (mention && suggestionCount && ["ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); setSelected((current) => (current + (event.key === "ArrowDown" ? 1 : -1) + suggestionCount) % suggestionCount); return; }
            if (mention && suggestionCount && ((event.key === "Enter" && !event.shiftKey) || (event.key === "Tab" && !event.shiftKey))) { event.preventDefault(); if(suggestions[selected])selectMention(suggestions[selected]);else{insert(`@${mass[selected-suggestions.length]} `,mention.start,mention.end);setDismissed(true);} return; }
            if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); if (!(mention && mentionLoading)) void submit(); }
          }} />
      </label>
    </div>
    <div className="chat-composer-footer">
      <label className="composer-icon composer-attach" title="Attach files"><Paperclip size={20} /><span className="sr-only">Attach files</span><input type="file" multiple accept={attachmentAccept} disabled={disabled || staged.length >= 4} onChange={(event) => { if (event.target.files) addFiles(event.target.files); event.target.value = ""; }} /></label>
      <label className="composer-icon composer-attach" title="Attach images"><ImagePlus size={20} /><span className="sr-only">Attach images</span><input type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif" disabled={disabled || staged.length >= 4} onChange={(event) => { if (event.target.files) addFiles(event.target.files); event.target.value = ""; }} /></label>
      <span id={`${listId}-help`} className="muted composer-help">{draft.length}/4000 · Enter to send · Shift+Enter for a new line · Markdown · Files up to 3 MB</span>
      <button type="button" className="composer-icon" aria-label="Choose emoji" aria-haspopup="dialog" aria-expanded={emojiOpen} disabled={disabled} onClick={() => { setEmojiSearch(""); setEmojiOpen(true); emojiDialog.current?.showModal(); }}><Smile size={20} /></button>
      <button type="button" className="composer-icon composer-gif" disabled title="GIF search is not configured. Attach a GIF file instead.">GIF</button>
      <button type="submit" className="button primary" disabled={!canPost || sending || staged.some((item) => item.state !== "ready") || (!draft.trim() && !staged.length)}>{sending ? "Sending…" : attempt ? "Retry message" : "Send message"}</button>
    </div>
    {attempt && !sending && <p className="muted">Keep this page open. Retry checks the same message; editing is paused until delivery is confirmed.</p>}
    {dragging && <p role="status">Drop files to attach</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <span role="status" className="composer-notice">{sending ? "Sending message…" : notice}</span>
    <dialog ref={emojiDialog} className="composer-emoji" aria-label="Choose emoji" onClose={() => setEmojiOpen(false)}>
      <div className="composer-emoji-header"><strong>Choose emoji</strong><button type="button" className="composer-icon" aria-label="Close emoji picker" onClick={() => emojiDialog.current?.close()}><X size={18} /></button></div>
      <label><span className="sr-only">Search emoji</span><input placeholder="Search emoji" value={emojiSearch} onChange={(event) => setEmojiSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} /></label>
      <div className="composer-emoji-grid">{composerEmoji.filter(([, name]) => name.includes(emojiSearch.toLowerCase().trim())).map(([emoji, name]) => <button type="button" key={name} aria-label={name} title={name} disabled={disabled} onClick={() => { emojiDialog.current?.close(); insert(emoji, selection.current.start, selection.current.end); }}>{emoji}</button>)}</div>
      {!composerEmoji.some(([, name]) => name.includes(emojiSearch.toLowerCase().trim())) && <p>No matching emoji</p>}
    </dialog>
  </form>;
}
